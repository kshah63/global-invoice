import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { data: entryRows } = await supabase
    .from("timesheet_entries")
    .select("*")
    .order("entry_date", { ascending: false });
  const entries = (entryRows as TimesheetEntry[]) ?? [];

  // Resolve member names + the "add for a member" picker with the admin client
  // (names only). This is independent of the active flag and RLS, so a test
  // member always resolves and shows up in the picker.
  const admin = createAdminClient();
  const memberIds = [...new Set(entries.map((e) => e.team_member_id))];
  const [{ data: nameRows }, { data: pickRows }] = await Promise.all([
    memberIds.length
      ? admin.from("team_members").select("id, name").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin.from("team_members").select("id, name").in("employee_id", TIMESHEET_TEST_LOGIN_IDS),
  ]);

  const memberNameById = new Map(
    ((nameRows as { id: string; name: string }[]) ?? []).map((m) => [m.id, m.name])
  );
  const members = ((pickRows as { id: string; name: string }[]) ?? []).map((m) => ({
    id: m.id,
    name: m.name,
  }));

  const rows: TimesheetRowView[] = entries.map((e) => ({
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
