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
import type { Profile, TeamMember, TeamMemberRate } from "@/lib/types";

export const metadata = { title: "People" };

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
  ) : (
    <Badge className="bg-ink-100 text-ink-600 ring-ink-200">Inactive</Badge>
  );
}

const RATE_UNIT_SHORT: Record<string, string> = {
  per_hour: "/hr",
  per_session: "/session",
  fixed: "",
};

// A person's pay at a glance: their fixed salary, or a summary of their rates
// (up to two, then "+N more").
function PayCell({ member, rates }: { member: TeamMember; rates: TeamMemberRate[] }) {
  if (member.fixed_salary != null) {
    return <span>{formatCurrency(member.fixed_salary, member.currency)}</span>;
  }
  if (rates.length === 0) return <span className="text-ink-400">—</span>;
  const shown = rates.slice(0, 2);
  const extra = rates.length - shown.length;
  return (
    <span className="text-ink-700">
      {shown.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? ", " : ""}
          {formatCurrency(Number(r.amount), member.currency)}
          <span className="text-ink-400">{RATE_UNIT_SHORT[r.unit] ?? ""}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-ink-400"> +{extra} more</span>}
    </span>
  );
}

function RowActions({ href, member }: { href: string; member: TeamMember }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={href}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
      >
        Edit
      </Link>
      <form action={setTeamMemberActive}>
        <input type="hidden" name="id" value={member.id} />
        <input type="hidden" name="active" value={String(!member.active)} />
        <SubmitButton variant="ghost" size="sm">
          {member.active ? "Deactivate" : "Activate"}
        </SubmitButton>
      </form>
    </div>
  );
}

export default async function PeoplePage({
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
  const individuals = members.filter((m) => m.member_type !== "supplier");
  const suppliers = members.filter((m) => m.member_type === "supplier");
  const deptHeads = (heads as Profile[]) ?? [];

  // Rates for individuals, so the Pay column can show hourly/session rates for
  // people who aren't on a fixed salary.
  const individualIds = individuals.map((m) => m.id);
  const { data: rateData } = individualIds.length
    ? await supabase
        .from("team_member_rates")
        .select("*")
        .in("team_member_id", individualIds)
        .order("sort_order")
    : { data: [] as TeamMemberRate[] };
  const ratesByMember = new Map<string, TeamMemberRate[]>();
  ((rateData as TeamMemberRate[]) ?? []).forEach((r) => {
    const arr = ratesByMember.get(r.team_member_id) ?? [];
    arr.push(r);
    ratesByMember.set(r.team_member_id, arr);
  });

  // Roster size per supplier.
  const supplierIds = suppliers.map((s) => s.id);
  const { data: rosterRows } = supplierIds.length
    ? await supabase
        .from("supplier_members")
        .select("supplier_id")
        .in("supplier_id", supplierIds)
    : { data: [] as { supplier_id: string }[] };
  const rosterCount = new Map<string, number>();
  ((rosterRows as { supplier_id: string }[]) ?? []).forEach((r) => {
    rosterCount.set(r.supplier_id, (rosterCount.get(r.supplier_id) ?? 0) + 1);
  });

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="People"
        description="Individuals, suppliers and department heads."
        action={
          <div className="flex flex-wrap gap-2">
            <Button href="/hr/team-members/new">Add individual</Button>
            <Button href="/hr/suppliers/new" variant="neutral">
              Add supplier
            </Button>
            <Button href="/hr/department-heads/new" variant="neutral">
              Add department head
            </Button>
          </div>
        }
      />

      {/* Individuals */}
      <Card>
        <CardHeader title="Individuals" description={`${individuals.length} total`} />
        <CardBody className="p-0">
          {individuals.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No individuals yet"
                description="Add your first individual contractor to begin."
                action={<Button href="/hr/team-members/new">Add individual</Button>}
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
                    <th className="px-5 py-3 font-semibold">Pay</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {individuals.map((m) => (
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
                        <PayCell member={m} rates={ratesByMember.get(m.id) ?? []} />
                      </td>
                      <td className="px-5 py-3">
                        <ActiveBadge active={m.active} />
                      </td>
                      <td className="px-5 py-3">
                        <RowActions href={`/hr/team-members/${m.id}`} member={m} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Suppliers */}
      <Card className="mt-8">
        <CardHeader
          title="Suppliers"
          description="A business that invoices for several people. The leader signs in with the supplier code or email."
        />
        <CardBody className="p-0">
          {suppliers.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No suppliers yet"
                description="Use “Add supplier” at the top to add one."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Supplier</th>
                    <th className="px-5 py-3 font-semibold">Code</th>
                    <th className="px-5 py-3 font-semibold">Roster</th>
                    <th className="px-5 py-3 font-semibold">Currency</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {suppliers.map((m) => (
                    <tr key={m.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/hr/suppliers/${m.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {m.name}
                        </Link>
                        <div className="text-xs text-ink-400">{m.email}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">
                        {m.supplier_code}
                      </td>
                      <td className="px-5 py-3 tnum text-ink-700">
                        {rosterCount.get(m.id) ?? 0}
                        <span className="ml-1 text-xs text-ink-400">
                          {(rosterCount.get(m.id) ?? 0) === 1 ? "person" : "people"}
                        </span>
                      </td>
                      <td className="px-5 py-3">{m.currency}</td>
                      <td className="px-5 py-3">
                        <ActiveBadge active={m.active} />
                      </td>
                      <td className="px-5 py-3">
                        <RowActions href={`/hr/suppliers/${m.id}`} member={m} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Department heads */}
      <Card className="mt-8">
        <CardHeader
          title="Department heads"
          description="They submit session/hour cross-checks and sign in with their Login ID."
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
                      <div className="text-xs text-ink-400">Login ID: {h.login_code}</div>
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
