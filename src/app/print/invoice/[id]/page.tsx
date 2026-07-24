import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFxRate } from "@/lib/fx";
import type { Currency } from "@/lib/constants";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PrintToolbar } from "@/components/PrintToolbar";
import type { Invoice, InvoiceLineItem } from "@/lib/types";

export const metadata = { title: "Invoice" };

export default async function PrintInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();
  const supabase = createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", params.id)
    .order("sort_order");

  const { data: tm } = await supabase
    .from("team_members")
    .select("name, employee_id, email, whatsapp_number, payment_details, payment_currency")
    .eq("id", (invoice as Invoice).team_member_id)
    .maybeSingle();

  const inv = invoice as Invoice;
  const rateCurrency = inv.currency as Currency;
  const paymentCurrency = ((tm as { payment_currency: Currency | null } | null)
    ?.payment_currency ?? null) as Currency | null;
  const fxRate =
    paymentCurrency && paymentCurrency !== rateCurrency
      ? await getFxRate(rateCurrency, paymentCurrency)
      : null;

  return (
    <div className="min-h-screen bg-ink-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        <PrintToolbar />
        <InvoiceDocument
          invoice={inv}
          items={(items as InvoiceLineItem[]) ?? []}
          teamMember={tm as never}
          paymentCurrency={paymentCurrency}
          fxRate={fxRate}
        />
      </div>
    </div>
  );
}
