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

type LineRow = {
  invoice_id: string;
  supplier_member_id: string | null;
  worked_by_name: string | null;
  line_total: number;
};

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

  // Per-roster-member breakdown for supplier invoices: sum each person's lines,
  // and pool expenses/adjustments (lines with no person) separately.
  const supplierRows = rows.filter((r) => r.member.member_type === "supplier" && r.invoice);
  const supInvoiceIds = supplierRows.map((r) => r.invoice!.id);
  const { data: liRows } = supInvoiceIds.length
    ? await supabase
        .from("invoice_line_items")
        .select("invoice_id, supplier_member_id, worked_by_name, line_total")
        .in("invoice_id", supInvoiceIds)
    : { data: [] as LineRow[] };
  type Breakdown = { people: Map<string, { name: string; total: number }>; other: number };
  const breakdownByInvoice = new Map<string, Breakdown>();
  ((liRows as LineRow[]) ?? []).forEach((li) => {
    const g = breakdownByInvoice.get(li.invoice_id) ?? { people: new Map(), other: 0 };
    if (li.supplier_member_id) {
      const cur = g.people.get(li.supplier_member_id) ?? {
        name: li.worked_by_name ?? "Member",
        total: 0,
      };
      cur.total += Number(li.line_total);
      g.people.set(li.supplier_member_id, cur);
    } else {
      g.other += Number(li.line_total);
    }
    breakdownByInvoice.set(li.invoice_id, g);
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
          description="Finalised = approved or paid. Only these are counted in the payable totals."
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

      {supplierRows.length > 0 && (
        <Card className="mt-8">
          <CardHeader
            title="Supplier breakdown"
            description="Each supplier invoice split by roster member, plus pooled expenses and adjustments."
          />
          <CardBody className="space-y-6">
            {supplierRows.map(({ member, invoice }) => {
              const inv = invoice!;
              const b = breakdownByInvoice.get(inv.id) ?? {
                people: new Map<string, { name: string; total: number }>(),
                other: 0,
              };
              const people = [...b.people.values()].sort((a, c) =>
                a.name.localeCompare(c.name)
              );
              return (
                <div key={inv.id}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-ink-900">{member.name}</div>
                    <div className="flex items-center gap-3">
                      <StatusPill status={inv.status} />
                      <span className="tnum font-semibold text-ink-900">
                        {formatCurrency(inv.total, inv.currency)}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-ink-100">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-ink-100">
                        {people.length === 0 && b.other === 0 ? (
                          <tr>
                            <td className="px-4 py-2 text-ink-400">
                              No roster lines on this invoice yet.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {people.map((p) => (
                              <tr key={p.name}>
                                <td className="px-4 py-2 text-ink-700">{p.name}</td>
                                <td className="px-4 py-2 text-right tnum">
                                  {formatCurrency(p.total, inv.currency)}
                                </td>
                              </tr>
                            ))}
                            {b.other !== 0 && (
                              <tr>
                                <td className="px-4 py-2 text-ink-500">
                                  Expenses &amp; adjustments
                                </td>
                                <td className="px-4 py-2 text-right tnum">
                                  {formatCurrency(b.other, inv.currency)}
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    </>
  );
}
