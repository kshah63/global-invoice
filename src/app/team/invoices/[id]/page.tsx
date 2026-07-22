import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canTeamMemberEdit } from "@/lib/invoice";
import { periodLabel } from "@/lib/constants";
import { Flash } from "@/components/Flash";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { InvoiceEditor } from "@/components/invoice/InvoiceEditor";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { deleteInvoice } from "@/actions/invoices";
import type { Invoice, InvoiceLineItem, TeamMember, TeamMemberRate } from "@/lib/types";

export default async function TeamInvoiceDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("team_member");
  const supabase = createClient();

  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!invoiceRow) notFound();
  const invoice = invoiceRow as Invoice;

  const [{ data: itemsRows }, { data: tmRow }, { data: rateRows }] =
    await Promise.all([
      supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("sort_order"),
      supabase
        .from("team_members")
        .select("*")
        .eq("id", invoice.team_member_id)
        .maybeSingle(),
      supabase
        .from("team_member_rates")
        .select("*")
        .eq("team_member_id", invoice.team_member_id)
        .order("sort_order"),
    ]);

  const items = (itemsRows as InvoiceLineItem[]) ?? [];
  const tm = tmRow as TeamMember | null;
  const rates = (rateRows as TeamMemberRate[]) ?? [];
  const editable = canTeamMemberEdit(invoice.status);

  return (
    <>
      <div className="mb-4">
        <Link href="/team/invoices" className="text-sm text-brand-600 hover:underline">
          ← My invoices
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {periodLabel(invoice.period_year, invoice.period_month)}
          </h1>
          <p className="mt-1 font-mono text-sm text-ink-500 tnum">
            {invoice.invoice_number}
          </p>
        </div>
        <StatusPill status={invoice.status} />
      </div>

      <Flash ok={searchParams.ok} error={searchParams.error} />

      {editable ? (
        <>
          <InvoiceEditor
            invoice={invoice}
            initialItems={items}
            rates={rates}
            teamMember={{
              name: tm?.name ?? invoice.display_name,
              fixed_salary: tm?.fixed_salary ?? null,
            }}
          />
          {invoice.status === "draft" && (
            <div className="mt-8 rounded-2xl border border-red-100 bg-red-50/50 p-4">
              <form action={deleteInvoice} className="flex items-center justify-between gap-3">
                <div className="text-sm text-ink-600">
                  Delete this draft invoice. This cannot be undone.
                </div>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  confirm="Delete this draft invoice permanently?"
                >
                  Delete draft
                </SubmitButton>
              </form>
            </div>
          )}
        </>
      ) : (
        <>
          <Alert tone={invoice.status === "paid" ? "success" : "info"} className="mb-5">
            {invoice.status === "paid"
              ? "This invoice has been paid."
              : "This invoice is locked by HR and can no longer be edited."}
          </Alert>
          <div className="mb-4 flex justify-end">
            <Button href={`/print/invoice/${invoice.id}`} variant="neutral" size="sm">
              Download / Print
            </Button>
          </div>
          <InvoiceDocument invoice={invoice} items={items} teamMember={tm} />
        </>
      )}
    </>
  );
}
