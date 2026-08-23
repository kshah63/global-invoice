import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { PrintButton } from "@/components/PrintButton";
import { ReportTable, type ReportRow } from "@/components/hr/ReportTable";
import { FxSummary } from "@/components/hr/FxSummary";
import {
  periodLabel,
  TASK_LABELS,
  type Currency,
  type DashboardStatus,
  type TaskType,
} from "@/lib/constants";
import type { Invoice, TeamMember } from "@/lib/types";

export const metadata = { title: "Reports" };

type LineRow = {
  invoice_id: string;
  supplier_member_id: string | null;
  worked_by_name: string | null;
  rate_descriptor: string | null;
  task: TaskType;
  sessions: number;
  hours: number;
  line_total: number;
  sort_order: number;
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
  const [{ data: memberRows }, { data: invRows }, { data: fxRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, supplier_code, member_type, currency")
      .eq("active", true)
      .order("name"),
    supabase.from("invoices").select("*").eq("period_year", year).eq("period_month", month),
    supabase
      .from("report_fx_rates")
      .select("currency, units_per_sgd")
      .eq("year", year)
      .eq("month", month),
  ]);

  const membersRaw =
    (memberRows as Pick<
      TeamMember,
      "id" | "name" | "employee_id" | "supplier_code" | "member_type" | "currency"
    >[]) ?? [];
  // Individuals first, then suppliers — each alphabetical.
  const members = [...membersRaw].sort((a, b) => {
    const as = a.member_type === "supplier" ? 1 : 0;
    const bs = b.member_type === "supplier" ? 1 : 0;
    return as - bs || a.name.localeCompare(b.name);
  });
  const invByMember = new Map<string, Invoice>();
  const invoiceById = new Map<string, Invoice>();
  (invRows as Invoice[] | null)?.forEach((i) => {
    invByMember.set(i.team_member_id, i);
    invoiceById.set(i.id, i);
  });
  const memberNameById = new Map<string, string>();
  members.forEach((m) => memberNameById.set(m.id, m.name));

  // Per-currency totals across the period's invoices, and the set of currencies
  // in use (so every currency — including INR — gets a widget even at 0).
  // Bundled individual invoices are paid via their supplier, so they're excluded
  // here to avoid counting the amount twice.
  const curTotals = new Map<Currency, number>();
  const inUse = new Set<Currency>();
  members.forEach((m) => {
    inUse.add(m.currency as Currency);
    const inv = invByMember.get(m.id);
    if (inv) {
      inUse.add(inv.currency);
      // Bundled invoices are paid via their supplier; reversed invoices had their
      // amount carried to next month. Both are excluded to avoid double-counting.
      if (!inv.bundled_into_invoice_id && inv.status !== "reversed") {
        curTotals.set(inv.currency, (curTotals.get(inv.currency) ?? 0) + Number(inv.total));
      }
    }
  });
  const curOrder = (c: Currency) => (c === "SGD" ? 0 : c === "INR" ? 1 : 2);
  const fxEntries = [...inUse]
    .map((c) => ({ currency: c, total: curTotals.get(c) ?? 0 }))
    .sort((a, b) => curOrder(a.currency) - curOrder(b.currency) || a.currency.localeCompare(b.currency));

  const initialRates: Partial<Record<Currency, number>> = {};
  ((fxRows as { currency: Currency; units_per_sgd: number }[]) ?? []).forEach((r) => {
    initialRates[r.currency] = Number(r.units_per_sgd);
  });

  // Line items for supplier invoices — powers the inline expandable detail.
  const supInvoiceIds = members
    .filter((m) => m.member_type === "supplier" && invByMember.get(m.id))
    .map((m) => invByMember.get(m.id)!.id);
  const { data: liRows } = supInvoiceIds.length
    ? await supabase
        .from("invoice_line_items")
        .select(
          "invoice_id, supplier_member_id, worked_by_name, rate_descriptor, task, sessions, hours, line_total, sort_order"
        )
        .in("invoice_id", supInvoiceIds)
    : { data: [] as LineRow[] };
  type LineDetail = {
    member: string;
    label: string;
    sessions: number;
    hours: number;
    amount: number;
    hasMember: boolean;
    sort: number;
  };
  const linesByInvoice = new Map<string, LineDetail[]>();
  ((liRows as LineRow[]) ?? []).forEach((li) => {
    const arr = linesByInvoice.get(li.invoice_id) ?? [];
    arr.push({
      member: li.worked_by_name ?? "—",
      label: li.rate_descriptor || TASK_LABELS[li.task] || String(li.task),
      sessions: Number(li.sessions),
      hours: Number(li.hours),
      amount: Number(li.line_total),
      hasMember: !!li.supplier_member_id,
      sort: li.sort_order,
    });
    linesByInvoice.set(li.invoice_id, arr);
  });
  // People lines first (by name), then pooled expenses/adjustments.
  linesByInvoice.forEach((arr) =>
    arr.sort((a, b) =>
      a.hasMember !== b.hasMember
        ? a.hasMember
          ? -1
          : 1
        : a.member.localeCompare(b.member) || a.sort - b.sort
    )
  );

  const reportRows: ReportRow[] = members.map((m) => {
    const inv = invByMember.get(m.id);
    const isSupplier = m.member_type === "supplier";
    const bundledId = inv?.bundled_into_invoice_id ?? null;
    const bundledInto = bundledId
      ? memberNameById.get(invoiceById.get(bundledId)?.team_member_id ?? "") ?? "supplier"
      : null;
    return {
      id: m.id,
      name: m.name,
      idLabel: m.employee_id ?? m.supplier_code ?? "",
      status: (inv ? inv.status : "not_started") as DashboardStatus,
      currency: (inv?.currency ?? m.currency) as Currency,
      subtotal: inv ? Number(inv.subtotal) : null,
      tax: inv ? Number(inv.tax_amount) : null,
      total: inv ? Number(inv.total) : null,
      invoiceId: inv?.id ?? null,
      isSupplier,
      bundledInto,
      lines:
        inv && isSupplier
          ? (linesByInvoice.get(inv.id) ?? []).map((l) => ({
              member: l.member,
              label: l.label,
              sessions: l.sessions,
              hours: l.hours,
              amount: l.amount,
            }))
          : [],
    };
  });

  return (
    <>
      <PageHeader
        title="Payroll Report"
        description={`All active team members for ${periodLabel(year, month)}. Click a name to open the invoice, or a supplier to see its line items.`}
        action={<PrintButton />}
      />

      <div className="mb-6 no-print">
        <PeriodNav basePath="/hr/reports" year={year} month={month} />
      </div>

      <div className="print-area">
        {fxEntries.length > 0 && (
          <FxSummary
            year={year}
            month={month}
            entries={fxEntries}
            initialRates={initialRates}
          />
        )}

        <ReportTable rows={reportRows} />
      </div>
    </>
  );
}
