import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { setTeamMemberActive } from "@/actions/team-members";
import { deleteDepartmentHead } from "@/actions/settings";
import { formatCurrency } from "@/lib/format";
import type { Profile, TeamMember } from "@/lib/types";

export const metadata = { title: "Team Members" };

export default async function TeamMembersPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();
  const [{ data }, { data: heads }] = await Promise.all([
    supabase
      .from("team_members")
      .select("*")
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "department_head")
      .order("full_name"),
  ]);
  const members = (data as TeamMember[]) ?? [];
  const deptHeads = (heads as Profile[]) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="People"
        description="Manage team members and department heads."
        action={
          <div className="flex flex-wrap gap-2">
            <Button href="/hr/team-members/new">Add team member</Button>
            <Button href="/hr/department-heads/new" variant="neutral">
              Add department head
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader title="Team members" description={`${members.length} total`} />
        <CardBody className="p-0">
          {members.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No team members yet"
                description="Add your first team member to begin."
                action={<Button href="/hr/team-members/new">Add team member</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Currency</th>
                    <th className="px-5 py-3 font-semibold">Fixed salary</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/hr/team-members/${m.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {m.name}
                        </Link>
                        <div className="text-xs text-ink-400">{m.email}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {m.employee_id}
                      </td>
                      <td className="px-5 py-3">{m.currency}</td>
                      <td className="px-5 py-3 tnum">
                        {m.fixed_salary != null
                          ? formatCurrency(m.fixed_salary, m.currency)
                          : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {m.active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/hr/team-members/${m.id}`}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                          >
                            Edit
                          </Link>
                          <form action={setTeamMemberActive}>
                            <input type="hidden" name="id" value={m.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={String(!m.active)}
                            />
                            <SubmitButton variant="ghost" size="sm">
                              {m.active ? "Deactivate" : "Activate"}
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mt-8">
        <CardHeader
          title="Department heads"
          description="They submit session/hour cross-checks and sign in with their 4-digit Login ID."
        />
        <CardBody className={deptHeads.length === 0 ? undefined : "p-0"}>
          {deptHeads.length === 0 ? (
            <EmptyState
              title="No department heads yet"
              description="Use “Add department head” at the top to add one."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {deptHeads.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="font-medium text-ink-900">
                      {h.full_name ?? h.email}
                    </div>
                    <div className="text-xs text-ink-400">{h.email}</div>
                    {h.login_code && (
                      <div className="text-xs text-ink-400">
                        Login ID: {h.login_code}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {h.business && (
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                        {h.business}
                      </Badge>
                    )}
                    <form action={deleteDepartmentHead}>
                      <input type="hidden" name="profile_id" value={h.id} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        confirm={`Remove ${h.full_name ?? h.email}?`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
