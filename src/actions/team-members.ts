"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import type { Currency, RateUnit, TaskType } from "@/lib/constants";

export interface RateInput {
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
  sort_order: number;
}

export interface TeamMemberInput {
  name: string;
  email: string;
  employee_id: string;
  whatsapp_number: string | null;
  date_joined: string | null;
  nationality: string | null;
  work_location: string | null;
  head_of_department: string | null;
  payment_details: string | null;
  currency: Currency;
  fixed_salary: number | null;
  subjects: string[];
  rates: RateInput[];
}

async function ensureHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");
  return session;
}

function ratesRows(teamMemberId: string, rates: RateInput[]) {
  return rates
    .filter((r) => r.descriptor.trim().length > 0)
    .map((r, i) => ({
      team_member_id: teamMemberId,
      descriptor: r.descriptor.trim(),
      unit: r.unit,
      amount: r.amount || 0,
      task: r.task,
      sort_order: r.sort_order ?? i,
    }));
}

// --- Create ---------------------------------------------------------------

export async function createTeamMember(
  input: TeamMemberInput & { password: string }
): Promise<{ error?: string }> {
  await ensureHr();
  const admin = createAdminClient();

  // 1) Create the login account (trigger creates the matching profile row).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { role: "team_member", full_name: input.name },
    app_metadata: { role: "team_member" },
  });
  if (cErr || !created?.user) {
    return { error: cErr?.message ?? "Could not create the login account." };
  }
  const profileId = created.user.id;

  // 2) Create the team member record (as HR — RLS enforced).
  const supabase = createClient();
  const { data: tm, error } = await supabase
    .from("team_members")
    .insert({
      profile_id: profileId,
      name: input.name,
      email: input.email,
      employee_id: input.employee_id,
      whatsapp_number: input.whatsapp_number,
      date_joined: input.date_joined,
      nationality: input.nationality,
      work_location: input.work_location,
      head_of_department: input.head_of_department,
      payment_details: input.payment_details,
      currency: input.currency,
      fixed_salary: input.fixed_salary,
      subjects: input.subjects,
      use_hr_name: true,
    })
    .select("id")
    .single();

  if (error || !tm) {
    // Roll back the orphaned auth user so the email can be reused.
    await admin.auth.admin.deleteUser(profileId);
    return { error: error?.message ?? "Could not create the team member." };
  }

  const rows = ratesRows(tm.id, input.rates);
  if (rows.length) {
    const { error: rErr } = await supabase.from("team_member_rates").insert(rows);
    if (rErr) return { error: `Team member created, but rates failed: ${rErr.message}` };
  }

  revalidatePath("/hr/team-members");
  redirect(`/hr/team-members/${tm.id}?ok=${encodeURIComponent("Team member created.")}`);
}

// --- Update ---------------------------------------------------------------

export async function updateTeamMember(
  id: string,
  input: TeamMemberInput
): Promise<{ error?: string }> {
  await ensureHr();
  const supabase = createClient();

  const { error } = await supabase
    .from("team_members")
    .update({
      name: input.name,
      email: input.email,
      employee_id: input.employee_id,
      whatsapp_number: input.whatsapp_number,
      date_joined: input.date_joined,
      nationality: input.nationality,
      work_location: input.work_location,
      head_of_department: input.head_of_department,
      payment_details: input.payment_details,
      currency: input.currency,
      fixed_salary: input.fixed_salary,
      subjects: input.subjects,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  // Replace rate set (line-item snapshots preserve history).
  await supabase.from("team_member_rates").delete().eq("team_member_id", id);
  const rows = ratesRows(id, input.rates);
  if (rows.length) {
    const { error: rErr } = await supabase.from("team_member_rates").insert(rows);
    if (rErr) return { error: rErr.message };
  }

  revalidatePath("/hr/team-members");
  revalidatePath(`/hr/team-members/${id}`);
  redirect(`/hr/team-members/${id}?ok=${encodeURIComponent("Changes saved.")}`);
}

// --- Active toggle --------------------------------------------------------

export async function setTeamMemberActive(formData: FormData) {
  await ensureHr();
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  const supabase = createClient();
  await supabase.from("team_members").update({ active }).eq("id", id);
  revalidatePath("/hr/team-members");
  revalidatePath(`/hr/team-members/${id}`);
  redirect(`/hr/team-members/${id}`);
}

// --- Delete ---------------------------------------------------------------

export async function deleteTeamMember(formData: FormData) {
  await ensureHr();
  const id = String(formData.get("id"));
  const supabase = createClient();

  const { data: tm } = await supabase
    .from("team_members")
    .select("profile_id")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("team_members").delete().eq("id", id);

  if (tm?.profile_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(tm.profile_id);
  }

  revalidatePath("/hr/team-members");
  redirect("/hr/team-members");
}
