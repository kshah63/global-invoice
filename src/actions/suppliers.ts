"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import type { Currency, PayType, RateUnit, TaskType } from "@/lib/constants";

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
  id: string | null;
  descriptor: string | null;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
}

export interface RosterPersonInput {
  id: string | null;
  name: string;
  code: string;
  role: string | null;
  pay_type: PayType;
  monthly_salary: number | null;
  subjects: string[];
  rates: RosterRateInput[]; // rate members only (1+); ignored for fixed salary
}

function apiKeyError(msg: string) {
  return /api[\s_-]?key/i.test(msg)
    ? "Supabase rejected the service role key. In Vercel, set SUPABASE_SERVICE_ROLE_KEY to your project's service_role key (Supabase → Project Settings → API keys) with no extra spaces, then redeploy."
    : msg;
}

// Find an existing auth user by email (used to recover an orphaned account).
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
) {
  const target = email.trim().toLowerCase();
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
): Promise<{ error?: string; saved?: { id: string; code: string }[] }> {
  await ensureHr();
  const supabase = createClient();

  const cleaned = people.filter((p) => p.name.trim() && /^[0-9]{4}$/.test(p.code.trim()));
  const badCode = people.find((p) => p.name.trim() && !/^[0-9]{4}$/.test(p.code.trim()));
  if (badCode) {
    return { error: `Each person needs a 4-digit ID (check "${badCode.name || "a person"}").` };
  }

  // Validate pay up front, before any writes (fixed needs a salary; rate needs
  // at least one rate).
  const badPay = cleaned.find(
    (p) =>
      (p.pay_type === "fixed" && !((p.monthly_salary ?? 0) > 0)) ||
      (p.pay_type === "rate" && !p.rates.some((r) => (r.amount ?? 0) > 0))
  );
  if (badPay) {
    return {
      error: `Set a ${badPay.pay_type === "fixed" ? "monthly salary" : "rate"} for "${badPay.name || "a person"}".`,
    };
  }

  // Existing members. We match each incoming person to an existing row by id
  // FIRST, then by code — so a save UPDATES in place and NEVER deletes +
  // re-creates a member (which would orphan their login and, via the invoice
  // FK's ON DELETE CASCADE, destroy their submissions).
  const { data: existingRows } = await supabase
    .from("supplier_members")
    .select("id, code")
    .eq("supplier_id", supplierId);
  const existing = (existingRows as { id: string; code: string }[] | null) ?? [];
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byCode = new Map(existing.map((e) => [e.code, e]));
  const matchedIds = new Set<string>();
  const saved: { id: string; code: string }[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const p = cleaned[i];
    const code = p.code.trim();
    // Mirror the first rate onto the member row as a fallback for anything that
    // still reads a single rate; the authoritative list lives in
    // supplier_member_rates.
    const first = p.pay_type === "rate" ? p.rates.find((r) => (r.amount ?? 0) > 0) : null;
    const payFields = {
      name: p.name.trim(),
      code,
      role: p.role || null,
      sort_order: i,
      subjects: p.subjects ?? [],
      pay_type: p.pay_type,
      monthly_salary: p.pay_type === "fixed" ? p.monthly_salary ?? 0 : null,
      rate_unit: first ? first.unit : "per_hour",
      rate_amount: first ? first.amount || 0 : 0,
      rate_descriptor: first ? first.descriptor?.trim() || null : null,
      rate_task: first ? first.task : null,
    };

    // Resolve which existing row this is: id wins, else the row with this code.
    let target = (p.id ? byId.get(p.id) : undefined) ?? byCode.get(code);
    if (target && matchedIds.has(target.id)) target = undefined; // already claimed

    let memberId: string;
    if (target) {
      matchedIds.add(target.id);
      const { error } = await supabase
        .from("supplier_members")
        .update(payFields)
        .eq("id", target.id);
      if (error) return { error: rosterError(error) };
      memberId = target.id;
    } else {
      const { data, error } = await supabase
        .from("supplier_members")
        .insert({ supplier_id: supplierId, ...payFields })
        .select("id")
        .single();
      if (error || !data) return { error: rosterError(error) };
      memberId = data.id;
    }
    saved.push({ id: memberId, code });

    // Replace this member's rate set (rate members only).
    await supabase.from("supplier_member_rates").delete().eq("supplier_member_id", memberId);
    if (p.pay_type === "rate") {
      const rateRows = p.rates
        .filter((r) => (r.amount ?? 0) > 0)
        .map((r, ri) => ({
          supplier_member_id: memberId,
          descriptor: r.descriptor?.trim() || "Work",
          unit: r.unit,
          amount: r.amount || 0,
          task: r.task,
          sort_order: ri,
        }));
      if (rateRows.length) {
        const { error } = await supabase.from("supplier_member_rates").insert(rateRows);
        if (error) return { error: rosterError(error) };
      }
    }
  }

  // Delete only members the user actually removed — those not matched by any
  // incoming person (by id or code).
  const toDelete = existing.filter((e) => !matchedIds.has(e.id)).map((e) => e.id);
  if (toDelete.length) {
    await supabase.from("supplier_members").delete().in("id", toDelete);
  }

  revalidatePath(`/hr/suppliers/${supplierId}`);
  return { saved };
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

// --- Roster member logins -------------------------------------------------

export async function createMemberLogin(
  memberId: string,
  input: { email?: string; password?: string; sendWelcomeEmail?: boolean }
): Promise<{ error?: string; message?: string }> {
  await ensureHr();

  const supabase = createClient();
  const { data: member } = await supabase
    .from("supplier_members")
    .select("id, name, code, profile_id, supplier_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: "Member not found." };
  if (member.profile_id) return { error: "This member already has a login." };

  // Email is optional — members sign in by their 4-digit ID. When no email is
  // given we create the account with a hidden placeholder they never use.
  const providedEmail = (input.email ?? "").trim();
  const hasEmail = providedEmail.includes("@");
  const email = hasEmail ? providedEmail : `${member.code}@members.invoicing.local`;
  const sendEmail = hasEmail && input.sendWelcomeEmail !== false;

  let password = (input.password ?? "").trim();
  if (!sendEmail && password.length < 8) {
    return {
      error: hasEmail
        ? "Set an initial password of at least 8 characters, or enable the welcome email."
        : "With no email, set an initial password of at least 8 characters.",
    };
  }
  if (!password) password = randomBytes(12).toString("base64url");

  const admin = createAdminClient();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "supplier_member", full_name: member.name },
    app_metadata: { role: "supplier_member" },
  });

  let profileId: string;
  let recovered = false;
  if (created?.user) {
    profileId = created.user.id;
  } else if (cErr && /already.*(been )?(registered|exists)/i.test(cErr.message)) {
    // An auth account with this email already exists — almost always an orphan
    // left behind before this bug was fixed. Relink it to this member and set
    // the password HR just entered, instead of failing.
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) return { error: apiKeyError(cErr.message) };
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { role: "supplier_member", full_name: member.name },
      app_metadata: { role: "supplier_member" },
    });
    if (updErr) return { error: updErr.message };
    profileId = existing.id;
    recovered = true;
  } else {
    return { error: apiKeyError(cErr?.message ?? "Could not create the login account.") };
  }

  const { error } = await supabase
    .from("supplier_members")
    .update({ profile_id: profileId, email: hasEmail ? providedEmail : null })
    .eq("id", memberId);
  if (error) {
    // Only clean up an account we freshly created — never a recovered one.
    if (!recovered) await admin.auth.admin.deleteUser(profileId);
    return { error: error.message };
  }

  let message = recovered
    ? `Login re-linked — they sign in with ID ${member.code}.`
    : `Login created — they sign in with ID ${member.code}.`;
  if (sendEmail) {
    try {
      const h = headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? "https";
      if (host) {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${proto}://${host}/auth/callback?next=/reset-password`,
        });
        message = `Login created — set-password email sent to ${email}. They sign in with ID ${member.code}.`;
      }
    } catch {
      /* best effort */
    }
  }

  revalidatePath(`/hr/suppliers/${member.supplier_id}`);
  return { message };
}

export async function resetMemberPassword(
  memberId: string,
  newPassword: string
): Promise<{ error?: string }> {
  await ensureHr();
  if (!newPassword || newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const supabase = createClient();
  const { data: member } = await supabase
    .from("supplier_members")
    .select("profile_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member?.profile_id) return { error: "This member has no login account." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(member.profile_id, {
    password: newPassword,
  });
  if (error) return { error: error.message };
  return {};
}

export async function removeMemberLogin(
  memberId: string
): Promise<{ error?: string }> {
  await ensureHr();
  const supabase = createClient();
  const { data: member } = await supabase
    .from("supplier_members")
    .select("profile_id, supplier_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member?.profile_id) return { error: "This member has no login account." };

  await supabase
    .from("supplier_members")
    .update({ profile_id: null })
    .eq("id", memberId);
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(member.profile_id);
  revalidatePath(`/hr/suppliers/${member.supplier_id}`);
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
