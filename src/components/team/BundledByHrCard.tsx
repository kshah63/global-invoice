import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";
import type { InvoiceLineItem } from "@/lib/types";

/**
 * Read-only view for the supplier leader of individuals HR has bundled onto
 * this invoice (paid via one bulk transfer). They can see them but not edit
 * them — HR manages these.
 */
export function BundledByHrCard({
  lines,
  currency,
}: {
  lines: InvoiceLineItem[];
  currency: Currency;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Added by HR"
        description="Individuals HR has attached to this invoice for a single bulk transfer. They're included in the total."
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-ink-100">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-ink-800">{l.rate_descriptor}</span>
                <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Added by HR</Badge>
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
