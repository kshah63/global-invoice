import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { setTeamMemberActive } from "@/actions/team-members";
import { formatCurrency } from "@/lib/format";
import type { TeamMember } from "@/lib/types";

export const metadata = { title: "Team Members" };

export default async function TeamMembersPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();
  const { data } = await supabase
    .from("team_members")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  const members = (data as TeamMember[]) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Team Members"
        description="Set up and maintain Global Online team members."
        action={<Button href="/hr/team-members/new">Add team member</Button>}
      />

      <Card>
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
    </>
  );
}
