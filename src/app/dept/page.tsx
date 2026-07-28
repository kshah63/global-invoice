import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { periodLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { DeptHeadCheck, InvoicePeriod } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function DeptOverview({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { profile } = await requireRole("department_head");
  const supabase = createClient();
  const [
    { data: checkData },
    { data: memberData },
    { data: periodData },
    { data: periodCounts },
  ] = await Promise.all([
    supabase
      .from("dept_head_checks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.rpc("list_team_members_for_dept"),
    supabase
      .from("invoice_periods")
      .select("*")
      .eq("is_open", true)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase.from("dept_head_checks").select("period_year, period_month"),
  ]);
  const checks = (checkData as DeptHeadCheck[]) ?? [];
  const openPeriods = (periodData as InvoicePeriod[]) ?? [];
  const nameById = new Map<string, string>();
  ((memberData as { id: string; name: string }[]) ?? []).forEach((m) =>
    nameById.set(m.id, m.name)
  );

  // How many individuals the head has cross-checked in each open month, so the
  // card can show progress and offer "start" vs "add / edit".
  const submittedByPeriod = new Map<string, number>();
  ((periodCounts as { period_year: number; period_month: number }[]) ?? []).forEach(
    (c) => {
      const k = `${c.period_year}-${c.period_month}`;
      submittedByPeriod.set(k, (submittedByPeriod.get(k) ?? 0) + 1);
    }
  );

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title={`Hello, ${(profile.full_name ?? "there").split(" ")[0]}`}
        description="Record the sessions and hours your teachers worked, so HR can cross-check invoices."
        action={
          <Button href="/dept/checks" variant="neutral">
            All cross-checks
          </Button>
        }
      />

      {profile.business && (
        <div className="mb-6">
          <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
            Department head · {profile.business}
          </Badge>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader
          title="Open for cross-checks"
          description="Months HR has opened. Start or continue your cross-check for the month."
        />
        <CardBody className="space-y-3">
          {openPeriods.length === 0 && (
            <p className="text-sm text-ink-500">
              No months are open for cross-checks right now. HR will let you know
              when the next month opens.
            </p>
          )}
          {openPeriods.map((p) => {
            const count = submittedByPeriod.get(`${p.year}-${p.month}`) ?? 0;
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-ink-900">
                    {periodLabel(p.year, p.month)}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {count === 0
                      ? "Not started"
                      : `${count} ${count === 1 ? "individual" : "individuals"} submitted`}
                  </div>
                </div>
                <Button
                  href={`/dept/checks/new?year=${p.year}&month=${p.month}`}
                  size="sm"
                  variant={count === 0 ? "primary" : "brand-soft"}
                >
                  {count === 0 ? "Start cross-check" : "Add / edit"}
                </Button>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent cross-checks"
          action={
            <Link href="/dept/checks" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          }
        />
        <CardBody className="p-0">
          {checks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No cross-checks yet"
                description="Create one to report a teacher's sessions and hours for a month."
                action={<Button href="/dept/checks/new">New cross-check</Button>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {checks.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dept/checks/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50"
                  >
                    <div>
                      <div className="font-medium text-ink-900">
                        {nameById.get(c.team_member_id) ?? "Team member"}
                      </div>
                      <div className="text-xs text-ink-400">
                        {periodLabel(c.period_year, c.period_month)} · {c.business}
                      </div>
                    </div>
                    <div className="text-xs text-ink-400">
                      {formatDateTime(c.updated_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
