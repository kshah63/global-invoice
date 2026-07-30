import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { formatCurrency } from "@/lib/format";
import {
  INVOICE_STATUSES,
  STATUS_META,
  periodLabel,
  type DashboardStatus,
} from "@/lib/constants";
import type { Invoice, InvoicePeriod, TeamMember } from "@/lib/types";

export const metadata = { title: "Dashboard" };

const CARD_ORDER: DashboardStatus[] = [
  "not_started",
  "draft",
  "submitted",
  "approved",
  "paid",
];

export default async function HrDashboard({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; ok?: string; error?: string };
}) {
  await requireRole("hr");
  const now = new Date();
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Number(searchParams.month) || now.getMonth() + 1;

  const supabase = createClient();
  const [{ data: members }, { data: invoices }, { data: period }] =
    await Promise.all([
      supabase
        .from("team_members")
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("invoices")
        .select("*")
        .eq("period_year", year)
        .eq("period_month", month),
      supabase
        .from("invoice_periods")
        .select("*")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle(),
    ]);

  const activeMembers = (members as TeamMember[]) ?? [];
  const invoiceByMember = new Map<string, Invoice>();
  (invoices as Invoice[] | null)?.forEach((inv) =>
    invoiceByMember.set(inv.team_member_id, inv)
  );

  const rows = activeMembers.map((m) => {
    const inv = invoiceByMember.get(m.id) ?? null;
    const status: DashboardStatus = inv ? inv.status : "not_started";
    return { member: m, invoice: inv, status };
  });

  const counts: Record<DashboardStatus, number> = {
    not_started: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    locked: 0,
    paid: 0,
  };
  rows.forEach((r) => (counts[r.status] += 1));
  // The "lock" step was removed; fold any legacy locked invoices into approved
  // so the summary still adds up and no stage is missing.
  counts.approved += counts.locked;
  counts.locked = 0;

  const openPeriod = period as InvoicePeriod | null;

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Dashboard"
        description={`Invoice status for ${periodLabel(year, month)}.`}
        action={
          <div className="flex gap-2">
            <Button href="/hr/periods" variant="neutral">
              Periods
            </Button>
            <Button href="/hr/messages">Message team</Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PeriodNav basePath="/hr" year={year} month={month} />
        <div className="flex items-center gap-2 text-sm">
          {openPeriod?.is_open ? (
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
              Open for invoicing
            </Badge>
          ) : (
            <Badge className="bg-ink-100 text-ink-600 ring-ink-200">Not opened</Badge>
          )}
        </div>
      </div>

      {/* Status summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CARD_ORDER.map((s) => (
          <div key={s} className="card px-4 py-3">
            <div className="text-2xl font-semibold tnum text-ink-900">{counts[s]}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Team members"
          description={`${activeMembers.length} active`}
          action={
            <Link href="/hr/reports" className="text-sm text-brand-600 hover:underline">
              Payroll report →
            </Link>
          }
        />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No team members yet"
                description="Add your first team member to get started."
                action={<Button href="/hr/team-members/new">Add team member</Button>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Team member</th>
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 text-right font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map(({ member, invoice, status }) => (
                    <tr key={member.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/hr/team-members/${member.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {member.name}
                        </Link>
                        <div className="text-xs text-ink-400">{member.email}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">
                        {member.employee_id ?? member.supplier_code}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={status} />
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {invoice
                          ? formatCurrency(invoice.total, invoice.currency)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {invoice ? (
                          <Link
                            href={`/hr/invoices/${invoice.id}`}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                          >
                            Review
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
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
