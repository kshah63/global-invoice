import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canTeamMemberEdit } from "@/lib/invoice";
import { periodLabel, TASK_LABELS, type Currency, type RateUnit, type TaskType } from "@/lib/constants";
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
import { RosterPayoutCard, type PayoutRow } from "@/components/team/RosterPayoutCard";
import { BundledByHrCard } from "@/components/team/BundledByHrCard";
import { InvoiceTabs } from "@/components/team/InvoiceTabs";
import { deleteInvoice } from "@/actions/invoices";
import type {
  Invoice,
  InvoiceLineItem,
  SupplierMember,
  SupplierMemberInvoice,
  SupplierMemberRate,
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
  const bundledLines = items.filter((i) => i.source_individual_invoice_id);
  const tm = tmRow as TeamMember | null;
  const isSupplier = tm?.member_type === "supplier";
  const editable = canTeamMemberEdit(invoice.status);

  let rates: TeamMemberRate[] = [];
  let roster: RosterPerson[] = [];
  let submissions: MemberSubmissionRow[] = [];
  let payoutRows: PayoutRow[] = [];
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
        .select(
          "*, member:supplier_members(name), items:supplier_member_invoice_items(id, task, rate_descriptor, sessions, hours, line_total, sort_order)"
        )
        .eq("supplier_id", invoice.team_member_id)
        .eq("period_year", invoice.period_year)
        .eq("period_month", invoice.period_month),
    ]);
    // Each roster person contributes their configured rates (fixed salary, or
    // one or more session/hour rates). The leader mostly pulls member
    // submissions; this is for manually adding a person who hasn't submitted.
    const rosterMembers = (rosterRows as SupplierMember[]) ?? [];
    const rosterIds = rosterMembers.map((m) => m.id);
    const { data: rosterRateRows } = rosterIds.length
      ? await supabase
          .from("supplier_member_rates")
          .select("*")
          .in("supplier_member_id", rosterIds)
          .order("sort_order")
      : { data: [] as SupplierMemberRate[] };
    const ratesByMember = new Map<string, SupplierMemberRate[]>();
    ((rosterRateRows as SupplierMemberRate[]) ?? []).forEach((r) => {
      const arr = ratesByMember.get(r.supplier_member_id) ?? [];
      arr.push(r);
      ratesByMember.set(r.supplier_member_id, arr);
    });
    roster = rosterMembers.map((m) => {
      if (m.pay_type === "fixed") {
        return {
          id: m.id,
          name: m.name,
          rates: [
            {
              id: m.id,
              descriptor: "Monthly salary",
              unit: "fixed" as RateUnit,
              amount: m.monthly_salary != null ? Number(m.monthly_salary) : 0,
              task: "fixed_salary" as TaskType,
            },
          ],
        };
      }
      const rateList = (ratesByMember.get(m.id) ?? []).map((r) => ({
        id: r.id,
        descriptor: r.descriptor || "Work",
        unit: r.unit as RateUnit,
        amount: Number(r.amount),
        task: (r.task ?? null) as TaskType | null,
      }));
      // Fallback to the mirrored single rate if no rate rows exist yet.
      if (rateList.length === 0 && Number(m.rate_amount) > 0) {
        rateList.push({
          id: m.id,
          descriptor: m.rate_descriptor || "Work",
          unit: m.rate_unit as RateUnit,
          amount: Number(m.rate_amount),
          task: (m.rate_task ?? null) as TaskType | null,
        });
      }
      return { id: m.id, name: m.name, rates: rateList };
    });
    type SubItem = {
      id: string;
      task: TaskType;
      rate_descriptor: string | null;
      sessions: number;
      hours: number;
      line_total: number;
      sort_order: number;
    };
    const subList =
      (subRows as (SupplierMemberInvoice & {
        member: { name: string } | null;
        items: SubItem[];
      })[]) ?? [];
    submissions = subList
      .map((s) => ({
        id: s.id,
        memberName: s.member?.name ?? s.display_name,
        status: s.status,
        total: Number(s.total),
        currency: s.currency as Currency,
        returnNote: s.return_note,
        items: [...(s.items ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((it) => ({
            id: it.id,
            label: it.rate_descriptor || TASK_LABELS[it.task] || String(it.task),
            sessions: Number(it.sessions),
            hours: Number(it.hours),
            total: Number(it.line_total),
          })),
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));

    // Per-person payout total on this invoice + their bank details.
    const totalByMember = new Map<string, number>();
    items.forEach((it) => {
      if (it.supplier_member_id) {
        totalByMember.set(
          it.supplier_member_id,
          (totalByMember.get(it.supplier_member_id) ?? 0) + Number(it.line_total)
        );
      }
    });
    payoutRows = rosterMembers
      .map((m) => ({
        name: m.name,
        role: m.role,
        bank: m.payment_details,
        total: totalByMember.get(m.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const { data: rateRows } = await supabase
      .from("team_member_rates")
      .select("*")
      .eq("team_member_id", invoice.team_member_id)
      .order("sort_order");
    rates = (rateRows as TeamMemberRate[]) ?? [];
  }

  // If this individual invoice is bundled into a supplier's bulk transfer, note it.
  let bundledIntoName: string | null = null;
  if (!isSupplier && invoice.bundled_into_invoice_id) {
    const { data: bInto } = await supabase
      .from("invoices")
      .select("team_members(name)")
      .eq("id", invoice.bundled_into_invoice_id)
      .maybeSingle();
    bundledIntoName =
      (bInto as { team_members: { name: string } | null } | null)?.team_members?.name ??
      "a supplier";
  }

  const deleteDraft =
    editable && invoice.status === "draft" ? (
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
    ) : null;

  // The main invoice content (editor when editable, document when locked). For
  // suppliers this becomes the "Invoice" tab, with roster payout alongside it.
  const invoiceMain = editable ? (
    <>
      {isSupplier ? (
        <>
          <MemberSubmissionsPanel
            consolidatedInvoiceId={invoice.id}
            submissions={submissions}
          />
          {bundledLines.length > 0 && (
            <BundledByHrCard lines={bundledLines} currency={invoice.currency} />
          )}
          <SupplierInvoiceEditor
            invoice={invoice}
            initialItems={items.filter((i) => !i.source_individual_invoice_id)}
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
      {deleteDraft}
    </>
  ) : (
    <>
      <Alert tone={invoice.status === "paid" ? "success" : "info"} className="mb-5">
        {invoice.status === "paid"
          ? "This invoice has been paid."
          : invoice.status === "approved"
            ? "This invoice has been approved and is now final. Contact HR if something needs changing."
            : "This invoice is locked by HR and can no longer be edited."}
      </Alert>
      <div className="mb-4 flex justify-end">
        <Button href={`/print/invoice/${invoice.id}`} variant="neutral" size="sm">
          Download / Print
        </Button>
      </div>
      <InvoiceDocument invoice={invoice} items={items} teamMember={tm} />
    </>
  );

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

      {bundledIntoName && (
        <Alert tone="info" className="mb-6" title={`Paid via ${bundledIntoName}`}>
          This invoice is included in {bundledIntoName}&apos;s bulk transfer, so it won&apos;t
          be paid to you separately.
        </Alert>
      )}

      {isSupplier ? (
        <InvoiceTabs
          tabs={[
            { key: "invoice", label: "Invoice", content: invoiceMain },
            {
              key: "payout",
              label: "Roster payout",
              content: <RosterPayoutCard rows={payoutRows} currency={invoice.currency} />,
            },
          ]}
        />
      ) : (
        invoiceMain
      )}
    </>
  );
}
