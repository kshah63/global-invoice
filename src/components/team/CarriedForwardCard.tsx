import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";
import type { InvoiceLineItem } from "@/lib/types";

/**
 * Read-only view for the employee of an amount HR carried into this invoice
 * because last month's payment was reversed by the bank. They can see it but
 * not edit it — it's included in the invoice total.
 */
export function CarriedForwardCard({
  lines,
  currency,
}: {
  lines: InvoiceLineItem[];
  currency: Currency;
}) {
  return (
    <Card className="mb-6 border-rose-200">
      <CardHeader
        title="Carried forward from last month"
        description="Last month's payment was reversed by the bank, so HR has added it here. It's included in your total below."
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-ink-100">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-ink-800">{l.rate_descriptor}</span>
                <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Added by HR</Badge>
              </div>
              <span className="tnum font-medium text-ink-900">
                {formatCurrency(Number(l.line_total), currency)}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
