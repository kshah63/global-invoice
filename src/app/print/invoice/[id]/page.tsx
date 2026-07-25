import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
    .select("name, employee_id, email, whatsapp_number, payment_details")
    .eq("id", (invoice as Invoice).team_member_id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-ink-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        <PrintToolbar />
        <InvoiceDocument
          invoice={invoice as Invoice}
          items={(items as InvoiceLineItem[]) ?? []}
          teamMember={tm as never}
        />
      </div>
    </div>
  );
}
