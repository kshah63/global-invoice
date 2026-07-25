import { RATE_UNIT_LABELS, periodLabel } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { TransferNote } from "@/components/TransferNote";
import type { SupplierMemberInvoice, SupplierMemberInvoiceItem } from "@/lib/types";

/**
 * Read-only summary of what a roster member confirmed for the month.
 * This is a payslip-style summary, not an invoice.
 */
export function MemberPaySummary({
  invoice,
  items,
  supplierName,
}: {
  invoice: SupplierMemberInvoice;
  items: SupplierMemberInvoiceItem[];
  supplierName: string;
}) {
  const currency = invoice.currency;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink-900">Pay summary</h2>
          <p className="mt-1 text-sm text-ink-500">
            {periodLabel(invoice.period_year, invoice.period_month)} · {supplierName}
          </p>
        </div>
        <MemberStatusBadge status={invoice.status} />
      </div>

      <ul className="divide-y divide-ink-100">
        {items.map((it) => {
          const showQty = it.rate_unit !== "fixed";
          const qty =
            it.rate_unit === "per_session"
              ? it.sessions
              : it.rate_unit === "per_hour"
                ? it.hours
                : 0;
          return (
            <li key={it.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-medium text-ink-900">
                  {it.rate_descriptor || it.note || "Line"}
                </div>
                {showQty && (
                  <div className="text-xs text-ink-400">
                    {formatNumber(qty)} × {formatCurrency(it.rate_amount, currency)}{" "}
                    {RATE_UNIT_LABELS[it.rate_unit].replace("per ", "/ ")}
                  </div>
                )}
              </div>
              <span className="tnum text-sm font-medium text-ink-900">
                {formatCurrency(it.line_total, currency)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-ink-200 pt-4">
        <span className="text-base font-semibold text-ink-900">Total</span>
        <span className="tnum text-base font-semibold text-ink-900">
          {formatCurrency(invoice.total, currency)}
        </span>
      </div>

      <TransferNote currency={currency} className="mt-4" />

      {invoice.notes && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Notes
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
