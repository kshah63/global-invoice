import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PeriodNav } from "@/components/hr/PeriodNav";
import { Flash } from "@/components/Flash";
import { InvoiceList, type InvoiceRow } from "@/components/hr/InvoiceList";
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

  const invoiceRows: InvoiceRow[] = rows.map((inv) => ({
    id: inv.id,
    name: inv.team_members?.name ?? inv.display_name,
    employee_id: inv.team_members?.employee_id ?? null,
    invoice_number: inv.invoice_number,
    status: inv.status,
    total: inv.total,
    currency: inv.currency,
  }));

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

      <InvoiceList rows={invoiceRows} />
    </>
  );
}
