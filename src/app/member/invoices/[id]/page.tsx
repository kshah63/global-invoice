import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodLabel, type Currency } from "@/lib/constants";
import { Flash } from "@/components/Flash";
import { Alert } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  MemberInvoiceEditor,
  type MemberRate,
} from "@/components/invoice/MemberInvoiceEditor";
import { MemberPaySummary } from "@/components/MemberPaySummary";
import { deleteMemberInvoice } from "@/actions/member-invoices";
import type { RateUnit, TaskType } from "@/lib/constants";
import type {
  SupplierMember,
  SupplierMemberInvoice,
  SupplierMemberInvoiceItem,
  SupplierMemberRate,
} from "@/lib/types";

export default async function MemberInvoiceDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("supplier_member");
  const supabase = createClient();

  const { data: invRow } = await supabase
    .from("supplier_member_invoices")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!invRow) notFound();
  const invoice = invRow as SupplierMemberInvoice;

  // The supplier's team_members row isn't readable by a member under RLS, so
  // read its name + currency with the admin client (those two fields only).
  const admin = createAdminClient();
  const [{ data: itemRows }, { data: memberRow }, { data: supplierRow }, { data: rateRows }] =
    await Promise.all([
      supabase
        .from("supplier_member_invoice_items")
        .select("*")
        .eq("member_invoice_id", invoice.id)
        .order("sort_order"),
      supabase
        .from("supplier_members")
        .select("*")
        .eq("id", invoice.supplier_member_id)
        .maybeSingle(),
      admin
        .from("team_members")
        .select("name, currency")
        .eq("id", invoice.supplier_id)
        .maybeSingle(),
      supabase
        .from("supplier_member_rates")
        .select("*")
        .eq("supplier_member_id", invoice.supplier_member_id)
        .order("sort_order"),
    ]);

  const items = (itemRows as SupplierMemberInvoiceItem[]) ?? [];
  const member = memberRow as SupplierMember | null;
  const supplier = supplierRow as { name: string; currency: Currency } | null;
  const supplierName = supplier?.name ?? "your agency";

  // Self-heal an editable draft whose currency drifted from the supplier's
  // current currency (e.g. created before the supplier's currency was set, or
  // when the RLS read defaulted it to SGD).
  if (
    supplier &&
    (invoice.status === "draft" || invoice.status === "returned") &&
    invoice.currency !== supplier.currency
  ) {
    await admin
      .from("supplier_member_invoices")
      .update({ currency: supplier.currency })
      .eq("id", invoice.id);
    invoice.currency = supplier.currency;
  }

  const rates: MemberRate[] = ((rateRows as SupplierMemberRate[]) ?? []).map((r) => ({
    id: r.id,
    descriptor: r.descriptor,
    unit: r.unit as RateUnit,
    amount: Number(r.amount),
    task: (r.task ?? null) as TaskType | null,
  }));

  const editable = invoice.status === "draft" || invoice.status === "returned";

  return (
    <>
      <div className="mb-4">
        <Link href="/member" className="text-sm text-brand-600 hover:underline">
          ← My submissions
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-900">
          {periodLabel(invoice.period_year, invoice.period_month)}
        </h1>
      </div>

      <Flash ok={searchParams.ok} error={searchParams.error} />

      {editable ? (
        <>
          <MemberInvoiceEditor
            invoice={invoice}
            initialItems={items}
            payType={member?.pay_type ?? "fixed"}
            monthlySalary={member?.monthly_salary != null ? Number(member.monthly_salary) : 0}
            rates={rates}
            supplierName={supplierName}
          />
          {invoice.status === "draft" && (
            <div className="mt-8 rounded-2xl border border-red-100 bg-red-50/50 p-4">
              <form action={deleteMemberInvoice} className="flex items-center justify-between gap-3">
                <div className="text-sm text-ink-600">
                  Delete this draft. This cannot be undone.
                </div>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <SubmitButton variant="danger" size="sm" confirm="Delete this draft permanently?">
                  Delete draft
                </SubmitButton>
              </form>
            </div>
          )}
        </>
      ) : (
        <>
          <Alert tone={invoice.status === "locked" ? "info" : "success"} className="mb-5">
            {invoice.status === "locked"
              ? "This month is locked by your leader and can no longer be edited."
              : "This has been sent to your leader. You'll be able to edit again only if it's sent back."}
          </Alert>
          <MemberPaySummary invoice={invoice} items={items} supplierName={supplierName} />
        </>
      )}
    </>
  );
}
