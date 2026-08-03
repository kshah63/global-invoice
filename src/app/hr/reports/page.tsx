import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { PrintButton } from "@/components/PrintButton";
import { ReportTable, type ReportRow } from "@/components/hr/ReportTable";
import { formatCurrency } from "@/lib/format";
import {
  periodLabel,
  TASK_LABELS,
  type Currency,
  type DashboardStatus,
  type TaskType,
} from "@/lib/constants";
import type { Invoice, TeamMember } from "@/lib/types";

export const metadata = { title: "Reports" };

const FINALISED = ["approved", "locked", "paid"];

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
  const [{ data: memberRows }, { data: invRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, supplier_code, member_type, currency")
      .eq("active", true)
      .order("name"),
    supabase.from("invoices").select("*").eq("period_year", year).eq("period_month", month),
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
  (invRows as Invoice[] | null)?.forEach((i) => invByMember.set(i.team_member_id, i));

  // Per-currency payable totals (finalised invoices only).
  const totals = new Map<Currency, number>();
  members.forEach((m) => {
    const inv = invByMember.get(m.id);
    if (inv && FINALISED.includes(inv.status)) {
      totals.set(inv.currency, (totals.get(inv.currency) ?? 0) + Number(inv.total));
    }
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

        <ReportTable rows={reportRows} />
      </div>
    </>
  );
}
