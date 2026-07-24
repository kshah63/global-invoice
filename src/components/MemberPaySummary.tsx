import { RATE_UNIT_LABELS, periodLabel, type Currency } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import type { SupplierMemberInvoice, SupplierMemberInvoiceItem } from "@/lib/types";

/**
 * Read-only summary of what a roster member confirmed for the month.
 * This is a payslip-style summary, not an invoice.
 */
export function MemberPaySummary({
  invoice,
  items,
  supplierName,
  paymentCurrency,
  fxRate,
}: {
  invoice: SupplierMemberInvoice;
  items: SupplierMemberInvoiceItem[];
  supplierName: string;
  paymentCurrency: Currency | null;
  fxRate: number | null;
}) {
  const currency = invoice.currency;
  const showFx = paymentCurrency && paymentCurrency !== currency;
  const converted = showFx && fxRate != null ? invoice.total * fxRate : null;

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

      {showFx && (
        <div className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500">
          {invoice.fx_rate != null ? (
            <>
              Paid in {paymentCurrency}:{" "}
              <span className="font-medium text-ink-700">
                {formatCurrency(invoice.total * Number(invoice.fx_rate), paymentCurrency!)}
              </span>{" "}
              at the recorded rate ({formatNumber(Number(invoice.fx_rate))}
              {invoice.fx_rate_date ? `, ${invoice.fx_rate_date}` : ""}).
            </>
          ) : converted != null ? (
            <>
              Paid in {paymentCurrency}: ≈{" "}
              <span className="font-medium text-ink-700">
                {formatCurrency(converted, paymentCurrency!)}
              </span>{" "}
              at today&apos;s indicative rate. The final amount depends on the exchange rate on
              your transfer day.
            </>
          ) : (
            <>
              Paid in {paymentCurrency}. The converted amount is confirmed at the exchange rate
              on your transfer day.
            </>
          )}
        </div>
      )}

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
