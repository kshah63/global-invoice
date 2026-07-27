import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Admin = ReturnType<typeof createAdminClient>;

// Readable password — no ambiguous characters (0/O, 1/l/I).
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function findAuthUserByEmail(admin: Admin, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Generate (or reset) a login for every roster member of a supplier and return
 * a Word document listing each person's portal link, User ID and password.
 * HR uses this to hand credentials to the supplier's leader. Passwords are
 * hashed in Supabase and can't be read back, so this necessarily sets fresh
 * passwords.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: supplier } = await supabase
    .from("team_members")
    .select("name")
    .eq("id", params.id)
    .eq("member_type", "supplier")
    .maybeSingle();
  if (!supplier) return new NextResponse("Supplier not found", { status: 404 });

  const { data: memberRows } = await supabase
    .from("supplier_members")
    .select("id, name, code, profile_id")
    .eq("supplier_id", params.id)
    .order("sort_order");
  const members =
    (memberRows as
      | { id: string; name: string; code: string; profile_id: string | null }[]
      | null) ?? [];

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const portal = host ? `${proto}://${host}/login` : "/login";

  const creds: { name: string; code: string; password: string }[] = [];
  for (const m of members) {
    const password = genPassword();
    let profileId = m.profile_id;

    if (profileId) {
      await admin.auth.admin.updateUserById(profileId, { password });
    } else {
      const email = `${m.code}@members.invoicing.local`;
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "supplier_member", full_name: m.name },
        app_metadata: { role: "supplier_member" },
      });
      if (created?.user) {
        profileId = created.user.id;
      } else if (error && /already.*(been )?(registered|exists)/i.test(error.message)) {
        const existing = await findAuthUserByEmail(admin, email);
        if (!existing) continue;
        await admin.auth.admin.updateUserById(existing.id, {
          password,
          user_metadata: { role: "supplier_member", full_name: m.name },
          app_metadata: { role: "supplier_member" },
        });
        profileId = existing.id;
      } else {
        continue; // skip this member on an unexpected error
      }
      await supabase.from("supplier_members").update({ profile_id: profileId }).eq("id", m.id);
    }

    if (profileId) {
      await admin.from("profiles").update({ role: "supplier_member" }).eq("id", profileId);
    }
    creds.push({ name: m.name, code: m.code, password });
  }

  const children: Paragraph[] = [
    new Paragraph({ text: `${supplier.name} — Portal logins`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: "MathVision Global Online invoicing portal. Please share each person's details with them privately. They sign in with their User ID and password.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const c of creds) {
    children.push(new Paragraph({ text: c.name, heading: HeadingLevel.HEADING_2 }));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Link to Portal: ", bold: true }), new TextRun(portal)],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "User ID: ", bold: true }), new TextRun(c.code)],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Password: ", bold: true }), new TextRun(c.password)],
      })
    );
    children.push(new Paragraph({ text: "" }));
  }

  if (creds.length === 0) {
    children.push(new Paragraph("This supplier has no roster members yet."));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const safe =
    supplier.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "supplier";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}-portal-logins.docx"`,
    },
  });
}
