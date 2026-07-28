import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { MultiCheckEditor, type InitialIndividual } from "@/components/dept/MultiCheckEditor";
import { periodLabel, type Centre } from "@/lib/constants";
import type {
  DeptHeadCheck,
  DeptHeadCheckItem,
  InvoicePeriod,
  TeamMember,
} from "@/lib/types";

export const metadata = { title: "New Cross-check" };

export default async function NewCheck({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const { profile } = await requireRole("department_head");
  const supabase = createClient();

  const [{ data: periodData }, { data: memberData }] = await Promise.all([
    supabase
      .from("invoice_periods")
      .select("*")
      .eq("is_open", true)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.rpc("list_team_members_for_dept"),
  ]);
  const openPeriods = (periodData as InvoicePeriod[]) ?? [];
  const members =
    (memberData as Pick<TeamMember, "id" | "name" | "employee_id">[]) ?? [];

  const backLink = (
    <div className="mb-4">
      <Link href="/dept/checks" className="text-sm text-brand-600 hover:underline">
        ← Cross-checks
      </Link>
    </div>
  );

  // No month is open — nothing for the head to do until HR opens one.
  if (openPeriods.length === 0) {
    return (
      <>
        {backLink}
        <PageHeader title="New cross-check" />
        <Alert tone="warning" title="No month is open yet">
          HR hasn&apos;t opened a month for cross-checks yet. You&apos;ll be able
          to submit one as soon as they do.
        </Alert>
      </>
    );
  }

  // Which open period are we filling in? Prefer the one named in the URL, else
  // auto-pick when there's only one open.
  const reqYear = Number(searchParams.year);
  const reqMonth = Number(searchParams.month);
  const selected =
    openPeriods.find((p) => p.year === reqYear && p.month === reqMonth) ??
    (openPeriods.length === 1 ? openPeriods[0] : null);

  // More than one month is open and none chosen — let the head pick.
  if (!selected) {
    return (
      <>
        {backLink}
        <PageHeader
          title="New cross-check"
          description="Pick the month you're reporting on."
        />
        <Card>
          <CardHeader title="Open months" description="Months HR has opened for cross-checks." />
          <CardBody className="space-y-3">
            {openPeriods.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
              >
                <div className="font-medium text-ink-900">
                  {periodLabel(p.year, p.month)}
                </div>
                <Button
                  href={`/dept/checks/new?year=${p.year}&month=${p.month}`}
                  size="sm"
                >
                  Start cross-check
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </>
    );
  }

  if (members.length === 0) {
    return (
      <>
        {backLink}
        <PageHeader title={`Cross-check — ${periodLabel(selected.year, selected.month)}`} />
        <Alert tone="warning">
          There are no active team members to report on yet.
        </Alert>
      </>
    );
  }

  // Pre-fill anything already submitted for this month so the head reviews /
  // adds rather than starting over.
  const { data: existingChecks } = await supabase
    .from("dept_head_checks")
    .select("*")
    .eq("created_by", profile.id)
    .eq("period_year", selected.year)
    .eq("period_month", selected.month)
    .order("created_at");
  const checks = (existingChecks as DeptHeadCheck[]) ?? [];

  // Cross-checks always belong to the department head's own business.
  const business: Centre = (profile.business as Centre) ?? "MathVision";

  let initialIndividuals: InitialIndividual[] | undefined;
  if (checks.length) {
    const { data: itemData } = await supabase
      .from("dept_head_check_items")
      .select("*")
      .in(
        "check_id",
        checks.map((c) => c.id)
      )
      .order("sort_order");
    const itemsByCheck = new Map<string, DeptHeadCheckItem[]>();
    ((itemData as DeptHeadCheckItem[]) ?? []).forEach((it) => {
      const arr = itemsByCheck.get(it.check_id) ?? [];
      arr.push(it);
      itemsByCheck.set(it.check_id, arr);
    });
    initialIndividuals = checks.map((c) => ({
      teamMemberId: c.team_member_id,
      notes: c.notes ?? "",
      items: (itemsByCheck.get(c.id) ?? []).map((it) => ({
        task: it.task,
        note: it.note,
        sessions: it.sessions,
        hours: it.hours,
        sort_order: it.sort_order,
      })),
    }));
  }

  return (
    <>
      {backLink}
      <PageHeader
        title={`Cross-check — ${periodLabel(selected.year, selected.month)}`}
        description="Add each individual with the sessions and hours they worked this month."
      />
      {checks.length > 0 && (
        <Alert tone="info" title={`${checks.length} already submitted for this month`} className="mb-6">
          They&apos;re loaded below — edit them, or use “Add individual” to include more people.
        </Alert>
      )}
      <MultiCheckEditor
        teamMembers={members}
        year={selected.year}
        month={selected.month}
        business={business}
        initialIndividuals={initialIndividuals}
      />
    </>
  );
}
