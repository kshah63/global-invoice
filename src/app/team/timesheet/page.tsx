import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timesheetEnabled } from "@/lib/timesheet";
import { PageHeader } from "@/components/AppShell";
import { TimesheetMemberClient } from "@/components/timesheet/TimesheetMemberClient";
import type { TimesheetRowView } from "@/components/timesheet/TimesheetTable";
import type { TimesheetEntry } from "@/lib/types";

export const metadata = { title: "Timesheet" };

export default async function TeamTimesheetPage() {
  const session = await requireRole("team_member");
  if (!(await timesheetEnabled(session))) redirect("/team");

  const supabase = createClient();
  const [{ data: entryRows }, { data: icRows }] = await Promise.all([
    supabase.from("timesheet_entries").select("*").order("entry_date", { ascending: false }),
    supabase.rpc("timesheet_inchargers"),
  ]);

  const inchargers = ((icRows as { id: string; full_name: string | null }[]) ?? []).map((i) => ({
    id: i.id,
    name: i.full_name ?? "In-charge",
  }));
  const nameById = new Map(inchargers.map((i) => [i.id, i.name]));

  const rows: TimesheetRowView[] = ((entryRows as TimesheetEntry[]) ?? []).map((e) => ({
    id: e.id,
    date: e.entry_date,
    business: e.business,
    task: e.task,
    description: e.description,
    sessions: Number(e.sessions),
    hours: Number(e.hours),
    status: e.status,
    inchargeId: e.incharge_id,
    inchargeName: e.incharge_id ? nameById.get(e.incharge_id) ?? null : null,
    memberName: null,
    returnNote: e.return_note,
    createdByIncharge: e.created_by_incharge,
  }));

  return (
    <>
      <PageHeader
        title="Timesheet"
        description="Log your teaching, training and support work. Your in-charge or HR verifies each entry."
      />
      <TimesheetMemberClient rows={rows} inchargers={inchargers} />
    </>
  );
}
