import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canTeamMemberEdit } from "@/lib/invoice";
import { periodLabel, type Currency, type RateUnit, type TaskType } from "@/lib/constants";
import { Flash } from "@/components/Flash";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { InvoiceEditor } from "@/components/invoice/InvoiceEditor";
import {
  SupplierInvoiceEditor,
  type RosterPerson,
} from "@/components/invoice/SupplierInvoiceEditor";
import {
  MemberSubmissionsPanel,
  type MemberSubmissionRow,
} from "@/components/invoice/MemberSubmissionsPanel";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { deleteInvoice } from "@/actions/invoices";
import type {
  Invoice,
  InvoiceLineItem,
  SupplierMember,
  SupplierMemberInvoice,
  TeamMember,
  TeamMemberRate,
} from "@/lib/types";

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

  const [{ data: itemsRows }, { data: tmRow }] = await Promise.all([
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
  ]);

  const items = (itemsRows as InvoiceLineItem[]) ?? [];
  const tm = tmRow as TeamMember | null;
  const isSupplier = tm?.member_type === "supplier";
  const editable = canTeamMemberEdit(invoice.status);

  let rates: TeamMemberRate[] = [];
  let roster: RosterPerson[] = [];
  let submissions: MemberSubmissionRow[] = [];
  if (isSupplier) {
    const [{ data: rosterRows }, { data: subRows }] = await Promise.all([
      supabase
        .from("supplier_members")
        .select("*")
        .eq("supplier_id", invoice.team_member_id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("supplier_member_invoices")
        .select("*, member:supplier_members(name)")
        .eq("supplier_id", invoice.team_member_id)
        .eq("period_year", invoice.period_year)
        .eq("period_month", invoice.period_month),
    ]);
    // Each roster person contributes one synthetic "rate": their fixed salary
    // or their session/hour rate. (The leader mostly pulls member submissions;
    // this is for manually adding a person who hasn't submitted.)
    roster = ((rosterRows as SupplierMember[]) ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      rates: [
        m.pay_type === "fixed"
          ? {
              id: m.id,
              descriptor: "Monthly salary",
              unit: "fixed" as RateUnit,
              amount: m.monthly_salary != null ? Number(m.monthly_salary) : 0,
              task: "fixed_salary" as TaskType,
            }
          : {
              id: m.id,
              descriptor: m.rate_descriptor || "Work",
              unit: m.rate_unit as RateUnit,
              amount: Number(m.rate_amount),
              task: (m.rate_task ?? null) as TaskType | null,
            },
      ],
    }));
    const subList =
      (subRows as (SupplierMemberInvoice & { member: { name: string } | null })[]) ?? [];
    submissions = subList
      .map((s) => ({
        id: s.id,
        memberName: s.member?.name ?? s.display_name,
        status: s.status,
        total: Number(s.total),
        currency: s.currency as Currency,
        returnNote: s.return_note,
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  } else {
    const { data: rateRows } = await supabase
      .from("team_member_rates")
      .select("*")
      .eq("team_member_id", invoice.team_member_id)
      .order("sort_order");
    rates = (rateRows as TeamMemberRate[]) ?? [];
  }

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
          {isSupplier ? (
            <>
              <MemberSubmissionsPanel
                consolidatedInvoiceId={invoice.id}
                submissions={submissions}
              />
              <SupplierInvoiceEditor
                invoice={invoice}
                initialItems={items}
                roster={roster}
                supplierName={tm?.name ?? invoice.display_name}
                submissionCount={submissions.filter((s) => s.status === "submitted").length}
              />
            </>
          ) : (
            <InvoiceEditor
              invoice={invoice}
              initialItems={items}
              rates={rates}
              teamMember={{
                name: tm?.name ?? invoice.display_name,
                fixed_salary: tm?.fixed_salary ?? null,
              }}
            />
          )}
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
