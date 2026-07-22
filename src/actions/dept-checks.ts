"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { Centre, TaskType } from "@/lib/constants";

export interface CheckItemInput {
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  sort_order: number;
}

export interface SaveCheckInput {
  checkId?: string | null;
  teamMemberId: string;
  year: number;
  month: number;
  business: Centre;
  notes: string | null;
  items: CheckItemInput[];
}

export async function saveCheck(
  input: SaveCheckInput
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || session.profile.role !== "department_head") redirect("/login");

  const supabase = createClient();
  let checkId = input.checkId ?? null;

  if (checkId) {
    const { error } = await supabase
      .from("dept_head_checks")
      .update({
        team_member_id: input.teamMemberId,
        period_year: input.year,
        period_month: input.month,
        business: input.business,
        notes: input.notes,
      })
      .eq("id", checkId);
    if (error) return { error: error.message };
    await supabase.from("dept_head_check_items").delete().eq("check_id", checkId);
  } else {
    const { data, error } = await supabase
      .from("dept_head_checks")
      .insert({
        created_by: session.profile.id,
        team_member_id: input.teamMemberId,
        period_year: input.year,
        period_month: input.month,
        business: input.business,
        notes: input.notes,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return {
          error:
            "You already submitted a cross-check for this teacher and month — open it to edit instead.",
        };
      }
      return { error: error.message };
    }
    checkId = data.id;
  }

  const rows = input.items
    .filter((it) => (it.sessions || 0) > 0 || (it.hours || 0) > 0 || it.note)
    .map((it, i) => ({
      check_id: checkId,
      task: it.task,
      note: it.note,
      sessions: it.sessions || 0,
      hours: it.hours || 0,
      sort_order: it.sort_order ?? i,
    }));
  if (rows.length) {
    const { error } = await supabase.from("dept_head_check_items").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/dept/checks");
  revalidatePath("/dept");
  redirect(`/dept/checks?ok=${encodeURIComponent("Cross-check saved.")}`);
}

export async function deleteCheck(formData: FormData) {
  const session = await getSession();
  if (!session || session.profile.role !== "department_head") redirect("/login");
  const id = String(formData.get("id"));
  const supabase = createClient();
  await supabase.from("dept_head_checks").delete().eq("id", id);
  revalidatePath("/dept/checks");
  revalidatePath("/dept");
  redirect("/dept/checks");
}
