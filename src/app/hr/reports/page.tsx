import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import { periodLabel, type Currency } from "@/lib/constants";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Reports" };

type Row = Invoice & { team_members: { name: string; employee_id: string } | null };

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
  const { data } = await supabase
    .from("invoices")
    .select("*, team_members(name, employee_id)")
    .eq("period_year", year)
    .eq("period_month", month)
    .order("status");
  const rows = (data as Row[]) ?? [];

  // Per-currency totals for finalised invoices (what needs to be paid)
  const totals = new Map<Currency, number>();
  rows
    .filter((r) => FINALISED.includes(r.status))
    .forEach((r) =>
      totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.total))
    );

  return (
    <>
      <PageHeader
        title="Payroll Report"
        description={`Amounts payable for ${periodLabel(year, month)}.`}
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
          title="Invoices"
          description="Finalised = approved, locked or paid. Only these are counted in the payable totals."
        />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No invoices for this period" />
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
                  {rows.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">
                        {inv.team_members?.name ?? inv.display_name}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {inv.team_members?.employee_id}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {formatCurrency(inv.subtotal, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {formatCurrency(inv.tax_amount, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tnum">
                        {formatCurrency(inv.total, inv.currency)}
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
