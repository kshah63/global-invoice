import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export interface MatrixCol {
  key: string;
  label: string;
}
export interface MatrixCell {
  value: number | null;
  missingRate?: boolean;
}
export interface MatrixRow {
  id: string;
  name: string;
  idLabel: string;
  isSupplier: boolean;
  currency: Currency;
  cells: MatrixCell[];
  rowTotal: number | null;
}

export function PayrollMatrix({
  cols,
  rows,
  mode,
  columnTotals,
  grandTotal,
}: {
  cols: MatrixCol[];
  rows: MatrixRow[];
  mode: "native" | "sgd";
  columnTotals?: (number | null)[];
  grandTotal?: number | null;
}) {
  // In SGD mode every value is SGD; in native mode a cell uses its row's currency.
  const cellText = (c: MatrixCell, rowCurrency: Currency): string => {
    if (c.missingRate) return "n/a";
    if (c.value == null) return "—";
    return formatCurrency(c.value, mode === "sgd" ? "SGD" : rowCurrency);
  };

  return (
    <Card>
      <CardHeader
        title="Paid by month"
        description={
          mode === "sgd"
            ? "Amounts paid to each employee per month, converted to SGD at that month's rate. Suppliers exclude any individuals bundled into their transfer (shown on their own rows)."
            : "Amounts paid to each employee per month, in each employee's own currency. Suppliers exclude any individuals bundled into their transfer (shown on their own rows)."
        }
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No team members" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold">
                    Team member
                  </th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right font-semibold whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50">
                    <td className="sticky left-0 z-10 bg-white px-5 py-3">
                      <div className="font-medium text-ink-900">{r.name}</div>
                      <div className="text-xs text-ink-400">
                        {r.idLabel}
                        {mode === "native" && <span className="ml-1">· {r.currency}</span>}
                      </div>
                    </td>
                    {r.cells.map((c, i) => (
                      <td
                        key={cols[i]?.key ?? i}
                        className={`px-4 py-3 text-right tnum ${
                          c.value == null && !c.missingRate ? "text-ink-300" : "text-ink-800"
                        }`}
                      >
                        {cellText(c, r.currency)}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right font-medium tnum text-ink-900">
                      {r.rowTotal == null
                        ? "—"
                        : formatCurrency(r.rowTotal, mode === "sgd" ? "SGD" : r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {mode === "sgd" && columnTotals && (
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-ink-50/60 font-semibold">
                    <td className="sticky left-0 z-10 bg-ink-50 px-5 py-3 text-ink-900">
                      Total (SGD)
                    </td>
                    {columnTotals.map((t, i) => (
                      <td key={cols[i]?.key ?? i} className="px-4 py-3 text-right tnum text-ink-900">
                        {t == null ? "—" : formatCurrency(t, "SGD")}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right tnum text-ink-900">
                      {grandTotal == null ? "—" : formatCurrency(grandTotal, "SGD")}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
