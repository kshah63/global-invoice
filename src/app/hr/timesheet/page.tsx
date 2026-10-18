import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/AppShell";
import { TimesheetHrClient } from "@/components/timesheet/TimesheetHrClient";
import type { TimesheetRowView } from "@/components/timesheet/TimesheetTable";
import type { TimesheetEntry } from "@/lib/types";

export const metadata = { title: "Timesheets" };

export default async function HrTimesheetPage() {
  await requireRole("hr");
  const supabase = createClient();
  const { data: entryRows } = await supabase
    .from("timesheet_entries")
    .select("*")
    .order("entry_date", { ascending: false });
  const entries = (entryRows as TimesheetEntry[]) ?? [];

  // Resolve member + in-charge names with the admin client (names only).
  const admin = createAdminClient();
  const memberIds = [...new Set(entries.map((e) => e.team_member_id))];
  const inchargeIds = [...new Set(entries.map((e) => e.incharge_id).filter(Boolean))] as string[];

  const [{ data: tmRows }, { data: profRows }, { data: icRows }] = await Promise.all([
    memberIds.length
      ? admin.from("team_members").select("id, name").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    inchargeIds.length
      ? admin.from("profiles").select("id, full_name").in("id", inchargeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    admin
      .from("profiles")
      .select("id, full_name")
      .eq("role", "department_head")
      .in("login_code", ["9999", "9876"]),
  ]);

  const memberName = new Map(
    ((tmRows as { id: string; name: string }[]) ?? []).map((m) => [m.id, m.name])
  );
  const inchargeName = new Map(
    ((profRows as { id: string; full_name: string | null }[]) ?? []).map((p) => [
      p.id,
      p.full_name ?? "In-charge",
    ])
  );
  const inchargers = ((icRows as { id: string; full_name: string | null }[]) ?? []).map((p) => ({
    id: p.id,
    name: p.full_name ?? "In-charge",
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
    inchargeName: e.incharge_id ? inchargeName.get(e.incharge_id) ?? null : null,
    memberName: memberName.get(e.team_member_id) ?? null,
    returnNote: e.return_note,
    createdByIncharge: e.created_by_incharge,
  }));

  return (
    <>
      <PageHeader
        title="Timesheets"
        description="All member timesheets, with advance visibility of non-teaching hours before they're invoiced."
      />
      <TimesheetHrClient rows={rows} inchargers={inchargers} />
    </>
  );
}
