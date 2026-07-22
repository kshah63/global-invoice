import {
  RATE_UNIT_LABELS,
  TASK_LABELS,
  TAX_DECLARATION,
  periodLabel,
} from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { StatusPill } from "@/components/ui/Badge";
import type { Invoice, InvoiceLineItem, TeamMember } from "@/lib/types";

function Party({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1 space-y-0.5 text-sm text-ink-700">{children}</div>
    </div>
  );
}

/**
 * Read-only invoice rendering, shared by the on-screen view and the print page.
 */
export function InvoiceDocument({
  invoice,
  items,
  teamMember,
}: {
  invoice: Invoice;
  items: InvoiceLineItem[];
  teamMember?: Pick<
    TeamMember,
    "name" | "employee_id" | "email" | "whatsapp_number" | "payment_details"
  > | null;
}) {
  const company = invoice.company_snapshot;
  const currency = invoice.currency;

  return (
    <div className="print-area rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-9">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-ink-100 pb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink-900">Invoice</h1>
          <p className="mt-1 font-mono text-sm text-ink-600 tnum">
            {invoice.invoice_number}
          </p>
          <div className="mt-3">
            <StatusPill status={invoice.status} />
          </div>
        </div>
        <div className="text-right text-sm text-ink-600">
          <div className="font-serif text-lg font-semibold text-ink-900">
            {company?.company_name ?? "MathVision"}
          </div>
          <div className="mt-1 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Global Online
          </div>
        </div>
      </div>

      {/* Parties + meta */}
      <div className="grid gap-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <Party label="From">
          <div className="font-medium text-ink-900">{invoice.display_name}</div>
          {teamMember?.employee_id && <div>ID: {teamMember.employee_id}</div>}
          {teamMember?.email && <div>{teamMember.email}</div>}
          {teamMember?.whatsapp_number && (
            <div>WhatsApp: {teamMember.whatsapp_number}</div>
          )}
          {invoice.ship_to_address && (
            <div className="whitespace-pre-line pt-1 text-ink-500">
              {invoice.ship_to_address}
            </div>
          )}
        </Party>

        <Party label="Billed to">
          <div className="font-medium text-ink-900">
            {company?.company_name ?? "MathVision"}
          </div>
          {company?.address && (
            <div className="whitespace-pre-line text-ink-500">{company.address}</div>
          )}
          {company?.email && <div>{company.email}</div>}
          {company?.phone && <div>{company.phone}</div>}
          {company?.registration_no && <div>Reg: {company.registration_no}</div>}
        </Party>

        <Party label="Billing period">
          <div className="font-medium text-ink-900">
            {periodLabel(invoice.period_year, invoice.period_month)}
          </div>
        </Party>

        <Party label="Dates">
          <div>Created {formatDate(invoice.created_at)}</div>
          {invoice.submitted_at && <div>Submitted {formatDate(invoice.submitted_at)}</div>}
          {invoice.paid_at && <div>Paid {formatDate(invoice.paid_at)}</div>}
        </Party>
      </div>

      {/* Line items */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm print:min-w-0">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr className="border-y border-ink-200 text-left text-[0.7rem] uppercase tracking-wider text-ink-500">
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
                  <td className="py-2.5 pr-3">{it.centre}</td>
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

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd className="tnum font-medium">{formatCurrency(invoice.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">
              Tax ({formatNumber(invoice.tax_rate)}%)
            </dt>
            <dd className="tnum font-medium">{formatCurrency(invoice.tax_amount, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
            <dt className="font-semibold text-ink-900">Total</dt>
            <dd className="tnum font-semibold text-ink-900">
              {formatCurrency(invoice.total, currency)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="mt-6 border-t border-ink-100 pt-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Notes
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{invoice.notes}</p>
        </div>
      )}

      {/* Payment details */}
      {teamMember?.payment_details && (
        <div className="mt-6 border-t border-ink-100 pt-4">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400">
            Payment details
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-600">
            {teamMember.payment_details}
          </p>
        </div>
      )}

      {/* Tax declaration */}
      <div className="mt-8 rounded-xl bg-ink-50 p-4 text-xs leading-relaxed text-ink-500">
        {TAX_DECLARATION}
      </div>
    </div>
  );
}
