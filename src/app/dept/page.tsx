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
import type { DeptHeadCheck } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function DeptOverview({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { profile } = await requireRole("department_head");
  const supabase = createClient();
  const [{ data: checkData }, { data: memberData }] = await Promise.all([
    supabase
      .from("dept_head_checks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
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
        title={`Hello, ${(profile.full_name ?? "there").split(" ")[0]}`}
        description="Record the sessions and hours your teachers worked, so HR can cross-check invoices."
        action={<Button href="/dept/checks/new">New cross-check</Button>}
      />

      {profile.business && (
        <div className="mb-6">
          <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
            Department head · {profile.business}
          </Badge>
        </div>
      )}

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
