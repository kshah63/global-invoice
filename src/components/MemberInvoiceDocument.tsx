import { RATE_UNIT_LABELS, TASK_LABELS, periodLabel } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import type { SupplierMemberInvoice, SupplierMemberInvoiceItem } from "@/lib/types";

/**
 * Read-only member invoice — billed to the supplier (not MathVision).
 */
export function MemberInvoiceDocument({
  invoice,
  items,
  memberName,
  supplierName,
  supplierPaymentDetails,
}: {
  invoice: SupplierMemberInvoice;
  items: SupplierMemberInvoiceItem[];
  memberName: string;
  supplierName: string;
  supplierPaymentDetails: string | null;
}) {
  const currency = invoice.currency;
  return (
    <div className="print-area rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-ink-100 pb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink-900">Invoice</h1>
          <p className="mt-1 text-sm text-ink-600">
            {periodLabel(invoice.period_year, invoice.period_month)}
          </p>
          <div className="mt-3">
            <MemberStatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="text-right text-sm text-ink-600">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Billed to
          </div>
          <div className="font-serif text-lg font-semibold text-ink-900">{supplierName}</div>
          {supplierPaymentDetails && (
            <div className="mt-1 whitespace-pre-line text-xs text-ink-500">
              {supplierPaymentDetails}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            From
          </div>
          <div className="mt-1 font-medium text-ink-900">{invoice.display_name || memberName}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-y border-ink-200 text-left text-[0.7rem] uppercase tracking-wider text-ink-500 [&_th]:whitespace-nowrap">
              <th className="py-2 pr-3 font-semibold">Centre</th>
              <th className="py-2 pr-3 font-semibold">Task</th>
              <th className="py-2 pr-3 font-semibold">Note</th>
              <th className="py-2 pr-3 text-right font-semibold">Sessions</th>
              <th className="py-2 pr-3 text-right font-semibold">Hours</th>
              <th className="py-2 pr-3 text-right font-semibold">Rate</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-400">
                  No line items.
                </td>
              </tr>
            )}
            {items.map((it) => {
              const fixed = it.rate_unit === "fixed";
              return (
                <tr key={it.id} className="align-top">
                  <td className="py-2.5 pr-3">{fixed ? "—" : it.centre}</td>
                  <td className="py-2.5 pr-3">{TASK_LABELS[it.task]}</td>
                  <td className="py-2.5 pr-3 text-ink-600">{it.note || "—"}</td>
                  <td className="py-2.5 pr-3 text-right tnum">
                    {fixed ? "—" : formatNumber(it.sessions)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tnum">
                    {fixed ? "—" : formatNumber(it.hours)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tnum">
                    {formatCurrency(it.rate_amount, currency)}
                    <span className="ml-1 text-xs text-ink-400">
                      {fixed ? "" : `/ ${RATE_UNIT_LABELS[it.rate_unit].replace("per ", "")}`}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-medium tnum">
                    {formatCurrency(it.line_total, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
            <dt className="font-semibold text-ink-900">Total</dt>
            <dd className="tnum font-semibold text-ink-900">
              {formatCurrency(invoice.total, currency)}
            </dd>
          </div>
        </dl>
      </div>

      {invoice.notes && (
        <div className="mt-6 border-t border-ink-100 pt-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Notes
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
