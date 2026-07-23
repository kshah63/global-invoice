"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import type { Currency, RateUnit, TaskType } from "@/lib/constants";

async function ensureHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");
  return session;
}

export interface SupplierInput {
  name: string;
  email: string;
  supplier_code: string;
  currency: Currency;
  payment_details: string | null;
}

export interface RosterRateInput {
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
}

export interface RosterPersonInput {
  id: string | null;
  name: string;
  code: string;
  rates: RosterRateInput[];
}

function apiKeyError(msg: string) {
  return /api[\s_-]?key/i.test(msg)
    ? "Supabase rejected the service role key. In Vercel, set SUPABASE_SERVICE_ROLE_KEY to your project's service_role key (Supabase → Project Settings → API keys) with no extra spaces, then redeploy."
    : msg;
}

// --- Create ---------------------------------------------------------------

export async function createSupplier(
  input: SupplierInput & { password?: string; sendWelcomeEmail?: boolean }
): Promise<{ error?: string }> {
  await ensureHr();
  const code = input.supplier_code.trim();
  if (!code) return { error: "A supplier code is required." };

  const sendEmail = input.sendWelcomeEmail !== false;
  let password = (input.password ?? "").trim();
  if (!sendEmail && password.length < 8) {
    return {
      error:
        "Set an initial password of at least 8 characters, or enable the welcome email.",
    };
  }
  if (!password) password = randomBytes(12).toString("base64url");

  const admin = createAdminClient();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { role: "team_member", full_name: input.name },
    app_metadata: { role: "team_member" },
  });
  if (cErr || !created?.user) {
    return { error: apiKeyError(cErr?.message ?? "Could not create the login account.") };
  }
  const profileId = created.user.id;

  const supabase = createClient();
  const { data: sup, error } = await supabase
    .from("team_members")
    .insert({
      profile_id: profileId,
      member_type: "supplier",
      supplier_code: code,
      name: input.name,
      email: input.email,
      currency: input.currency,
      payment_details: input.payment_details,
      use_hr_name: true,
    })
    .select("id")
    .single();

  if (error || !sup) {
    await admin.auth.admin.deleteUser(profileId);
    if (error?.code === "23505") {
      return { error: "That supplier code is already in use — pick another." };
    }
    return { error: error?.message ?? "Could not create the supplier." };
  }

  let okMsg = "Supplier created — now add its people below.";
  if (sendEmail) {
    try {
      const h = headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? "https";
      if (host) {
        await supabase.auth.resetPasswordForEmail(input.email, {
          redirectTo: `${proto}://${host}/auth/callback?next=/reset-password`,
        });
        okMsg = `Supplier created — a set-password email was sent to ${input.email}. Add its people below.`;
      }
    } catch {
      /* best effort */
    }
  }

  revalidatePath("/hr/team-members");
  redirect(`/hr/suppliers/${sup.id}?ok=${encodeURIComponent(okMsg)}`);
}

// --- Update details -------------------------------------------------------

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<{ error?: string }> {
  await ensureHr();
  const supabase = createClient();
  const { error } = await supabase
    .from("team_members")
    .update({
      name: input.name,
      email: input.email,
      supplier_code: input.supplier_code.trim(),
      currency: input.currency,
      payment_details: input.payment_details,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: "That supplier code is already in use — pick another." };
    }
    return { error: error.message };
  }
  revalidatePath("/hr/team-members");
  revalidatePath(`/hr/suppliers/${id}`);
  return {};
}

// --- Save the roster (people + their rates) -------------------------------

export async function saveRoster(
  supplierId: string,
  people: RosterPersonInput[]
): Promise<{ error?: string }> {
  await ensureHr();
  const supabase = createClient();

  const cleaned = people.filter((p) => p.name.trim() && /^[0-9]{4}$/.test(p.code.trim()));
  const badCode = people.find((p) => p.name.trim() && !/^[0-9]{4}$/.test(p.code.trim()));
  if (badCode) {
    return { error: `Each person needs a 4-digit ID (check "${badCode.name || "a person"}").` };
  }

  // Remove people no longer present.
  const { data: existing } = await supabase
    .from("supplier_members")
    .select("id")
    .eq("supplier_id", supplierId);
  const keepIds = new Set(cleaned.map((p) => p.id).filter(Boolean));
  const toDelete = ((existing as { id: string }[]) ?? [])
    .filter((e) => !keepIds.has(e.id))
    .map((e) => e.id);
  if (toDelete.length) {
    await supabase.from("supplier_members").delete().in("id", toDelete);
  }

  for (let i = 0; i < cleaned.length; i++) {
    const p = cleaned[i];
    let personId = p.id;

    if (personId) {
      const { error } = await supabase
        .from("supplier_members")
        .update({ name: p.name.trim(), code: p.code.trim(), sort_order: i })
        .eq("id", personId);
      if (error) return { error: rosterError(error) };
    } else {
      const { data, error } = await supabase
        .from("supplier_members")
        .insert({
          supplier_id: supplierId,
          name: p.name.trim(),
          code: p.code.trim(),
          sort_order: i,
        })
        .select("id")
        .single();
      if (error || !data) return { error: rosterError(error) };
      personId = data.id;
    }

    await supabase.from("supplier_member_rates").delete().eq("supplier_member_id", personId);
    const rateRows = p.rates
      .filter((r) => r.descriptor.trim())
      .map((r, ri) => ({
        supplier_member_id: personId,
        descriptor: r.descriptor.trim(),
        unit: r.unit,
        amount: r.amount || 0,
        task: r.task,
        sort_order: ri,
      }));
    if (rateRows.length) {
      const { error } = await supabase.from("supplier_member_rates").insert(rateRows);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/hr/suppliers/${supplierId}`);
  return {};
}

function rosterError(error: { code?: string; message: string } | null): string {
  if (error?.code === "23505") return "Two people have the same 4-digit ID — IDs must be unique.";
  return error?.message ?? "Could not save the roster.";
}

// --- Reset the leader's password ------------------------------------------

export async function resetSupplierPassword(
  id: string,
  newPassword: string
): Promise<{ error?: string }> {
  await ensureHr();
  if (!newPassword || newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const supabase = createClient();
  const { data: sup } = await supabase
    .from("team_members")
    .select("profile_id")
    .eq("id", id)
    .maybeSingle();
  if (!sup?.profile_id) return { error: "This supplier has no linked login account." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(sup.profile_id, {
    password: newPassword,
  });
  if (error) return { error: error.message };
  return {};
}

// --- Delete ---------------------------------------------------------------

export async function deleteSupplier(formData: FormData) {
  await ensureHr();
  const id = String(formData.get("id"));
  const supabase = createClient();
  const { data: sup } = await supabase
    .from("team_members")
    .select("profile_id")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("team_members").delete().eq("id", id);
  if (sup?.profile_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(sup.profile_id);
  }
  revalidatePath("/hr/team-members");
  redirect("/hr/team-members");
}
