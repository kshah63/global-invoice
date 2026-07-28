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

// --- Save several individuals in one submission ---------------------------
// The department head fills in Month/Year/Business once, then adds a block per
// individual. Each block becomes its own dept_head_check for that teacher and
// month. If a check for that teacher+month already exists it is updated in
// place (so adding one more person to a month you've already started never
// trips the "already submitted" unique-constraint error).

export interface CheckIndividualInput {
  teamMemberId: string;
  notes: string | null;
  items: CheckItemInput[];
}

export interface SaveChecksInput {
  year: number;
  month: number;
  business: Centre;
  individuals: CheckIndividualInput[];
}

export async function saveChecks(
  input: SaveChecksInput
): Promise<{ error?: string; saved?: number }> {
  const session = await getSession();
  if (!session || session.profile.role !== "department_head") redirect("/login");

  const supabase = createClient();

  // Guard against the same teacher appearing twice in one submission — the
  // second would silently overwrite the first.
  const seen = new Set<string>();
  for (const ind of input.individuals) {
    if (!ind.teamMemberId) continue;
    if (seen.has(ind.teamMemberId)) {
      return {
        error:
          "The same individual is selected more than once — combine their lines into a single entry.",
      };
    }
    seen.add(ind.teamMemberId);
  }

  let saved = 0;
  for (const ind of input.individuals) {
    if (!ind.teamMemberId) continue;

    const rows = ind.items
      .filter((it) => (it.sessions || 0) > 0 || (it.hours || 0) > 0 || it.note)
      .map((it, i) => ({
        task: it.task,
        note: it.note,
        sessions: it.sessions || 0,
        hours: it.hours || 0,
        sort_order: it.sort_order ?? i,
      }));

    // Skip a block the head added but never filled in.
    if (rows.length === 0 && !ind.notes) continue;

    // Update the existing check for this teacher+month if there is one.
    const { data: existing } = await supabase
      .from("dept_head_checks")
      .select("id")
      .eq("created_by", session.profile.id)
      .eq("team_member_id", ind.teamMemberId)
      .eq("period_year", input.year)
      .eq("period_month", input.month)
      .maybeSingle();

    let checkId = existing?.id ?? null;
    if (checkId) {
      const { error } = await supabase
        .from("dept_head_checks")
        .update({ business: input.business, notes: ind.notes })
        .eq("id", checkId);
      if (error) return { error: error.message };
      await supabase.from("dept_head_check_items").delete().eq("check_id", checkId);
    } else {
      const { data, error } = await supabase
        .from("dept_head_checks")
        .insert({
          created_by: session.profile.id,
          team_member_id: ind.teamMemberId,
          period_year: input.year,
          period_month: input.month,
          business: input.business,
          notes: ind.notes,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      checkId = data.id;
    }

    if (rows.length) {
      const { error } = await supabase
        .from("dept_head_check_items")
        .insert(rows.map((r) => ({ ...r, check_id: checkId })));
      if (error) return { error: error.message };
    }
    saved += 1;
  }

  if (saved === 0) {
    return { error: "Add sessions or hours for at least one individual." };
  }

  revalidatePath("/dept/checks");
  revalidatePath("/dept");
  const label = saved === 1 ? "Cross-check saved." : `${saved} cross-checks saved.`;
  redirect(`/dept/checks?ok=${encodeURIComponent(label)}`);
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
