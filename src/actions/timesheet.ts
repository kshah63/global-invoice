"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TimesheetInput } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/team/timesheet");
  revalidatePath("/dept/timesheet");
  revalidatePath("/hr/timesheet");
}

// Team member adds a line on their own timesheet.
export async function timesheetAdd(input: TimesheetInput): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_add", {
    p_date: input.date,
    p_business: input.business,
    p_task: input.task,
    p_description: input.description,
    p_sessions: input.sessions,
    p_hours: input.hours,
    p_incharge: input.inchargeId,
  });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

// In-charge / HR adds a line onto a member's timesheet.
export async function timesheetAddForMember(input: TimesheetInput): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_add_for_member", {
    p_member: input.memberId,
    p_date: input.date,
    p_business: input.business,
    p_task: input.task,
    p_description: input.description,
    p_sessions: input.sessions,
    p_hours: input.hours,
  });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function timesheetUpdate(
  id: string,
  input: TimesheetInput
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_update", {
    p_id: id,
    p_date: input.date,
    p_business: input.business,
    p_task: input.task,
    p_description: input.description,
    p_sessions: input.sessions,
    p_hours: input.hours,
    p_incharge: input.inchargeId,
  });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function timesheetVerify(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_verify", { p_id: id });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function timesheetAccept(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_accept", { p_id: id });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function timesheetReturn(id: string, note: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_return", { p_id: id, p_note: note });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function timesheetDelete(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("timesheet_delete", { p_id: id });
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}
