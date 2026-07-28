"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import type { Centre } from "@/lib/constants";

async function ensureHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");
  return session;
}

// --- MathVision company address (HR only) ---------------------------------

export async function updateCompany(formData: FormData) {
  const session = await ensureHr();
  const supabase = createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      company_name: String(formData.get("company_name") || "MathVision"),
      address: (formData.get("address") as string) || null,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      registration_no: (formData.get("registration_no") as string) || null,
      updated_at: new Date().toISOString(),
      updated_by: session.profile.id,
    })
    .eq("id", 1);

  if (error) {
    redirect(`/hr/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/hr/settings");
  redirect(`/hr/settings?ok=${encodeURIComponent("Company details updated.")}`);
}

// --- Department head accounts ---------------------------------------------

export async function createDepartmentHead(input: {
  name: string;
  email: string; // optional — they can sign in with their login ID instead
  password: string;
  business: Centre;
  loginCode: string;
}): Promise<{ error?: string }> {
  await ensureHr();
  // Codes are stored upper-cased so login matching is case-insensitive.
  const code = (input.loginCode ?? "").trim().toUpperCase();
  if (!/^[A-Za-z0-9]{4,6}$/.test(code)) {
    return { error: "Login ID must be 4–6 letters or numbers." };
  }
  const password = (input.password ?? "").trim();
  if (password.length < 8) {
    return { error: "Set an initial password of at least 8 characters." };
  }

  const admin = createAdminClient();

  // Keep the login space unambiguous across every code namespace.
  const { data: tmHit } = await admin
    .from("team_members")
    .select("id")
    .eq("employee_id", code)
    .maybeSingle();
  if (tmHit) {
    return { error: "That ID is already used by a team member — pick another." };
  }
  const { data: supHit } = await admin
    .from("team_members")
    .select("id")
    .eq("supplier_code", code)
    .maybeSingle();
  if (supHit) {
    return { error: "That ID is already used by a supplier — pick another." };
  }
  const { data: smHit } = await admin
    .from("supplier_members")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (smHit) {
    return { error: "That ID is already used by a roster member — pick another." };
  }
  const { data: profHit } = await admin
    .from("profiles")
    .select("id")
    .eq("login_code", code)
    .maybeSingle();
  if (profHit) {
    return { error: "That ID is already in use — pick another." };
  }

  // Email is optional — with none, use a hidden placeholder for the auth
  // account and let them sign in with their login ID.
  const providedEmail = (input.email ?? "").trim();
  const hasEmail = providedEmail.includes("@");
  const authEmail = hasEmail
    ? providedEmail
    : `${code.toLowerCase()}@dept.invoicing.local`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      role: "department_head",
      full_name: input.name,
      business: input.business,
    },
    app_metadata: { role: "department_head" },
  });
  if (error || !created?.user) {
    if (error && /api[\s_-]?key/i.test(error.message)) {
      return {
        error:
          "Supabase rejected the service role key. In Vercel, set SUPABASE_SERVICE_ROLE_KEY to your project's service_role key (Supabase → Project Settings → API keys) with no extra spaces, then redeploy.",
      };
    }
    return { error: error?.message ?? "Could not create the account." };
  }

  // Set login_code AND pin the role explicitly. The signup trigger derives the
  // role from app_metadata at creation, but if that doesn't stick the account
  // defaults to team_member and lands on the wrong portal — so set it here too.
  const { error: codeErr } = await admin
    .from("profiles")
    .update({ login_code: code, role: "department_head" })
    .eq("id", created.user.id);
  if (codeErr) {
    // Roll back the orphaned auth user so the code/email can be reused.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Account created, but assigning the login ID failed: ${codeErr.message}` };
  }

  revalidatePath("/hr/team-members");
  return {};
}

export async function deleteDepartmentHead(formData: FormData) {
  await ensureHr();
  const profileId = String(formData.get("profile_id"));
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(profileId);
  revalidatePath("/hr/team-members");
  redirect(`/hr/team-members?ok=${encodeURIComponent("Department head removed.")}`);
}
