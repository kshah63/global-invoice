import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { formatCurrency } from "@/lib/format";
import { periodLabel } from "@/lib/constants";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Invoices" };

type Row = Invoice & { team_members: { name: string; employee_id: string } | null };

export default async function HrInvoicesPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; ok?: string; error?: string };
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
    .order("status")
    .order("created_at");
  const rows = (data as Row[]) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Invoices"
        description={`Submitted invoices for ${periodLabel(year, month)}.`}
      />
      <div className="mb-6">
        <PeriodNav basePath="/hr/invoices" year={year} month={month} />
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No invoices for this period"
                description="Invoices will appear here once team members create them."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Team member</th>
                    <th className="px-5 py-3 font-semibold">Invoice #</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((inv) => (
                    <tr key={inv.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink-900">
                          {inv.team_members?.name ?? inv.display_name}
                        </div>
                        <div className="text-xs text-ink-400">
                          {inv.team_members?.employee_id}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/hr/invoices/${inv.id}`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          Review
                        </Link>
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
