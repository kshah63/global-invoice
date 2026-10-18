import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timesheetEnabled } from "@/lib/timesheet";
import { TIMESHEET_TEST_LOGIN_IDS } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { TimesheetInchargeClient } from "@/components/timesheet/TimesheetInchargeClient";
import type { TimesheetRowView } from "@/components/timesheet/TimesheetTable";
import type { TimesheetEntry } from "@/lib/types";

export const metadata = { title: "Timesheet" };

export default async function DeptTimesheetPage() {
  const session = await requireRole("department_head");
  if (!(await timesheetEnabled(session))) redirect("/dept");

  const supabase = createClient();
  const [{ data: entryRows }, { data: memberRows }] = await Promise.all([
    supabase.from("timesheet_entries").select("*").order("entry_date", { ascending: false }),
    supabase.rpc("list_team_members_for_dept"),
  ]);

  const allMembers = (memberRows as { id: string; name: string; employee_id: string | null }[]) ?? [];
  // While in testing the "add for a member" picker is limited to the test member.
  const members = allMembers
    .filter((m) => TIMESHEET_TEST_LOGIN_IDS.includes(m.employee_id ?? ""))
    .map((m) => ({ id: m.id, name: m.name }));
  const memberNameById = new Map(allMembers.map((m) => [m.id, m.name]));

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
    inchargeName: null,
    memberName: memberNameById.get(e.team_member_id) ?? null,
    returnNote: e.return_note,
    createdByIncharge: e.created_by_incharge,
  }));

  return (
    <>
      <PageHeader
        title="Timesheet"
        description="Review the work members submit, and log entries on their behalf."
      />
      <TimesheetInchargeClient rows={rows} members={members} />
    </>
  );
}
