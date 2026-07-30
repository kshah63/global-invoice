import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { periodLabel, TASK_LABELS, type TaskType } from "@/lib/constants";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { DeptHeadCheck, DeptHeadCheckItem, Invoice, Profile, TeamMember } from "@/lib/types";

export const metadata = { title: "Cross-checks" };

type CheckWithItems = DeptHeadCheck & { items: DeptHeadCheckItem[] };

export default async function HrChecksPage() {
  await requireRole("hr");
  const supabase = createClient();

  const { data: checkRows } = await supabase
    .from("dept_head_checks")
    .select("*, items:dept_head_check_items(*)")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false });
  const checks = (checkRows as CheckWithItems[]) ?? [];

  const authorIds = Array.from(new Set(checks.map((c) => c.created_by)));
  const memberIds = Array.from(new Set(checks.map((c) => c.team_member_id)));

  const [{ data: authorRows }, { data: memberRows }, { data: invoiceRows }] =
    await Promise.all([
      authorIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
        : Promise.resolve({ data: [] as Pick<Profile, "id" | "full_name" | "email">[] }),
      memberIds.length
        ? supabase.from("team_members").select("id, name, employee_id").in("id", memberIds)
        : Promise.resolve({ data: [] as Pick<TeamMember, "id" | "name" | "employee_id">[] }),
      memberIds.length
        ? supabase
            .from("invoices")
            .select("id, team_member_id, period_year, period_month, status")
            .in("team_member_id", memberIds)
        : Promise.resolve({
            data: [] as Pick<
              Invoice,
              "id" | "team_member_id" | "period_year" | "period_month" | "status"
            >[],
          }),
    ]);

  const authorName = new Map<string, string>();
  ((authorRows as Pick<Profile, "id" | "full_name" | "email">[]) ?? []).forEach((p) =>
    authorName.set(p.id, p.full_name ?? p.email ?? "Department head")
  );
  const memberName = new Map<string, string>();
  ((memberRows as Pick<TeamMember, "id" | "name" | "employee_id">[]) ?? []).forEach((m) =>
    memberName.set(m.id, m.name)
  );
  const invoiceByKey = new Map<string, { id: string; status: string }>();
  (
    (invoiceRows as Pick<
      Invoice,
      "id" | "team_member_id" | "period_year" | "period_month" | "status"
    >[]) ?? []
  ).forEach((inv) =>
    invoiceByKey.set(`${inv.team_member_id}-${inv.period_year}-${inv.period_month}`, {
      id: inv.id,
      status: inv.status,
    })
  );

  // Group by month so HR can scan "what came in for July".
  const groups = new Map<string, { year: number; month: number; items: CheckWithItems[] }>();
  checks.forEach((c) => {
    const key = `${c.period_year}-${c.period_month}`;
    const g = groups.get(key) ?? { year: c.period_year, month: c.period_month, items: [] };
    g.items.push(c);
    groups.set(key, g);
  });
  const groupList = [...groups.values()];

  return (
    <>
      <PageHeader
        title="Cross-checks"
        description="Sessions and hours reported by department heads. Open the matching invoice to compare line by line."
      />

      {checks.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No cross-checks yet"
              description="Department heads submit these for a month once you open it. They'll appear here as they come in."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupList.map((g) => (
            <section key={`${g.year}-${g.month}`}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                  {periodLabel(g.year, g.month)}
                </h2>
                <span className="text-xs text-ink-400">
                  {g.items.length} {g.items.length === 1 ? "cross-check" : "cross-checks"}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {g.items.map((c) => {
                  const rows = [...c.items].sort((a, b) => a.sort_order - b.sort_order);
                  const inv = invoiceByKey.get(
                    `${c.team_member_id}-${c.period_year}-${c.period_month}`
                  );
                  return (
                    <Card key={c.id}>
                      <CardHeader
                        title={memberName.get(c.team_member_id) ?? "Team member"}
                        description={`Submitted by ${authorName.get(c.created_by) ?? "Department head"} · ${formatDateTime(c.updated_at)}`}
                        action={
                          <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                            {c.business}
                          </Badge>
                        }
                      />
                      <CardBody className="space-y-3">
                        {rows.length === 0 ? (
                          <p className="text-sm text-ink-400">No sessions or hours recorded.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                                  <th className="py-1.5 pr-3 font-semibold">Task</th>
                                  <th className="py-1.5 pr-3 text-right font-semibold">Sessions</th>
                                  <th className="py-1.5 text-right font-semibold">Hours</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink-100">
                                {rows.map((it) => (
                                  <tr key={it.id}>
                                    <td className="py-1.5 pr-3">
                                      {TASK_LABELS[it.task as TaskType] ?? it.task}
                                      {it.note ? (
                                        <span className="text-ink-400"> · {it.note}</span>
                                      ) : null}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right tnum">
                                      {formatNumber(it.sessions)}
                                    </td>
                                    <td className="py-1.5 text-right tnum">
                                      {formatNumber(it.hours)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {c.notes && (
                          <p className="text-sm text-ink-600">
                            <span className="text-ink-400">Note: </span>
                            {c.notes}
                          </p>
                        )}
                        <div className="flex items-center justify-end pt-1">
                          {inv ? (
                            <Button href={`/hr/invoices/${inv.id}`} size="sm" variant="neutral">
                              Open invoice to compare
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-400">
                              No invoice submitted for this month yet
                            </span>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
