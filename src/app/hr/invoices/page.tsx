import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Flash } from "@/components/Flash";
import { InvoiceList, type InvoiceRow } from "@/components/hr/InvoiceList";
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
  // Fetch every period so the "All periods" scope can search across months;
  // the default view still filters to the selected period client-side.
  const { data } = await supabase
    .from("invoices")
    .select("*, team_members(name, employee_id)")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("created_at");
  const rows = (data as Row[]) ?? [];

  const invoiceRows: InvoiceRow[] = rows.map((inv) => ({
    id: inv.id,
    name: inv.team_members?.name ?? inv.display_name,
    employee_id: inv.team_members?.employee_id ?? null,
    invoice_number: inv.invoice_number,
    status: inv.status,
    total: inv.total,
    currency: inv.currency,
    year: inv.period_year,
    month: inv.period_month,
    // Individuals folded into a supplier's bulk transfer are paid via that
    // supplier, so they're never independently selectable for "mark paid".
    bundled: !!inv.bundled_into_invoice_id,
  }));

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader title="Invoices" description="Review submitted invoices." />
      <div className="mb-6">
        <PeriodNav basePath="/hr/invoices" year={year} month={month} />
      </div>

      <InvoiceList rows={invoiceRows} selectedYear={year} selectedMonth={month} />
    </>
  );
}
