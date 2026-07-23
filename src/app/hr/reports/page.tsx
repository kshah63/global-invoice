import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import { periodLabel, type Currency, type DashboardStatus } from "@/lib/constants";
import type { Invoice, TeamMember } from "@/lib/types";

export const metadata = { title: "Reports" };

const FINALISED = ["approved", "locked", "paid"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  await requireRole("hr");
  const now = new Date();
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Number(searchParams.month) || now.getMonth() + 1;

  const supabase = createClient();
  const [{ data: memberRows }, { data: invRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, supplier_code, member_type, currency")
      .eq("active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select("*")
      .eq("period_year", year)
      .eq("period_month", month),
  ]);

  const members =
    (memberRows as Pick<
      TeamMember,
      "id" | "name" | "employee_id" | "supplier_code" | "member_type" | "currency"
    >[]) ?? [];
  const invByMember = new Map<string, Invoice>();
  (invRows as Invoice[] | null)?.forEach((i) => invByMember.set(i.team_member_id, i));

  const rows = members.map((m) => ({ member: m, invoice: invByMember.get(m.id) ?? null }));

  // Per-currency totals for finalised invoices (what needs to be paid)
  const totals = new Map<Currency, number>();
  rows.forEach(({ invoice }) => {
    if (invoice && FINALISED.includes(invoice.status)) {
      totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + Number(invoice.total));
    }
  });

  return (
    <>
      <PageHeader
        title="Payroll Report"
        description={`All active team members for ${periodLabel(year, month)}.`}
        action={
          <Button href={`/hr/reports/export?year=${year}&month=${month}`}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-6">
        <PeriodNav basePath="/hr/reports" year={year} month={month} />
      </div>

      {totals.size > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {Array.from(totals.entries()).map(([cur, total]) => (
            <div key={cur} className="card px-5 py-4">
              <div className="text-xs uppercase tracking-wider text-ink-400">
                Payable · {cur}
              </div>
              <div className="mt-1 text-2xl font-semibold tnum text-ink-900">
                {formatCurrency(total, cur)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="Team members"
          description="Finalised = approved, locked or paid. Only these are counted in the payable totals."
        />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No active team members" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Team member</th>
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Subtotal</th>
                    <th className="px-5 py-3 text-right font-semibold">Tax</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map(({ member, invoice }) => {
                    const status: DashboardStatus = invoice ? invoice.status : "not_started";
                    return (
                      <tr key={member.id}>
                        <td className="px-5 py-3 font-medium text-ink-900">
                          {member.name}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-ink-500">
                          {member.employee_id ?? member.supplier_code}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill status={status} />
                        </td>
                        <td className="px-5 py-3 text-right tnum">
                          {invoice ? formatCurrency(invoice.subtotal, invoice.currency) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right tnum">
                          {invoice ? formatCurrency(invoice.tax_amount, invoice.currency) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-medium tnum">
                          {invoice ? formatCurrency(invoice.total, invoice.currency) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
