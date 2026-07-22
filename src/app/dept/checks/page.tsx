import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { periodLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { DeptHeadCheck } from "@/lib/types";

export const metadata = { title: "Cross-checks" };

export default async function DeptChecksList({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("department_head");
  const supabase = createClient();
  const [{ data: checkData }, { data: memberData }] = await Promise.all([
    supabase
      .from("dept_head_checks")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase.rpc("list_team_members_for_dept"),
  ]);
  const checks = (checkData as DeptHeadCheck[]) ?? [];
  const nameById = new Map<string, string>();
  ((memberData as { id: string; name: string }[]) ?? []).forEach((m) =>
    nameById.set(m.id, m.name)
  );

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Cross-checks"
        description="Session/hour records you've submitted for HR."
        action={<Button href="/dept/checks/new">New cross-check</Button>}
      />

      <Card>
        <CardBody className="p-0">
          {checks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No cross-checks yet"
                description="Report a teacher's sessions and hours for a month."
                action={<Button href="/dept/checks/new">New cross-check</Button>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {checks.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dept/checks/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
                  >
                    <div>
                      <div className="font-medium text-ink-900">
                        {nameById.get(c.team_member_id) ?? "Team member"}
                      </div>
                      <div className="text-xs text-ink-400">
                        {periodLabel(c.period_year, c.period_month)} · Updated{" "}
                        {formatDateTime(c.updated_at)}
                      </div>
                    </div>
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                      {c.business}
                    </Badge>
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
