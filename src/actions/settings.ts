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
  email: string;
  password: string;
  business: Centre;
}): Promise<{ error?: string }> {
  await ensureHr();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      role: "department_head",
      full_name: input.name,
      business: input.business,
    },
    app_metadata: { role: "department_head" },
  });
  if (error) {
    if (/api[\s_-]?key/i.test(error.message)) {
      return {
        error:
          "Supabase rejected the service role key. In Vercel, set SUPABASE_SERVICE_ROLE_KEY to your project's service_role key (Supabase → Project Settings → API keys) with no extra spaces, then redeploy.",
      };
    }
    return { error: error.message };
  }
  revalidatePath("/hr/settings");
  return {};
}

export async function deleteDepartmentHead(formData: FormData) {
  await ensureHr();
  const profileId = String(formData.get("profile_id"));
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(profileId);
  revalidatePath("/hr/settings");
  redirect(`/hr/settings?ok=${encodeURIComponent("Department head removed.")}`);
}
