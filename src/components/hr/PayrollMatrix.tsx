"use client";

import { Fragment, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
export interface MatrixSubRow {
  id: string;
  name: string;
  cells: MatrixCell[];
  rowTotal: number | null;
  isOther?: boolean;
}
export interface MatrixRow {
  id: string;
  name: string;
  idLabel: string;
  isSupplier: boolean;
  currency: Currency;
  cells: MatrixCell[];
  rowTotal: number | null;
  subRows?: MatrixSubRow[];
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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandableIds = rows.filter((r) => (r.subRows?.length ?? 0) > 0).map((r) => r.id);
  const allOpen = expandableIds.length > 0 && expandableIds.every((id) => open.has(id));

  // In SGD mode every value is SGD; in native mode a cell uses its row's currency.
  const cellText = (c: MatrixCell, rowCurrency: Currency): string => {
    if (c.missingRate) return "n/a";
    if (c.value == null) return "—";
    return formatCurrency(c.value, mode === "sgd" ? "SGD" : rowCurrency);
  };
  const totalText = (v: number | null, rowCurrency: Currency): string =>
    v == null ? "—" : formatCurrency(v, mode === "sgd" ? "SGD" : rowCurrency);

  return (
    <Card>
      <CardHeader
        title="Paid by month"
        description={
          mode === "sgd"
            ? "Amounts paid to each employee per month, converted to SGD at that month's rate. Click a supplier to break it down by roster member. Suppliers exclude any individuals bundled into their transfer (shown on their own rows)."
            : "Amounts paid to each employee per month, in each employee's own currency. Click a supplier to break it down by roster member. Suppliers exclude any individuals bundled into their transfer (shown on their own rows)."
        }
        action={
          expandableIds.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="neutral"
              className="no-print"
              onClick={() => setOpen(allOpen ? new Set() : new Set(expandableIds))}
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          ) : undefined
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
                {rows.map((r) => {
                  const expandable = (r.subRows?.length ?? 0) > 0;
                  const isOpen = open.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={
                          expandable ? "cursor-pointer hover:bg-ink-50" : "hover:bg-ink-50"
                        }
                        onClick={() => expandable && toggle(r.id)}
                      >
                        <td className="sticky left-0 z-10 bg-white px-5 py-3">
                          <div className="flex items-center gap-2">
                            {expandable ? (
                              <span
                                aria-hidden
                                className={`inline-block text-ink-400 transition-transform ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                              >
                                ▸
                              </span>
                            ) : (
                              <span className="inline-block w-[1ch]" />
                            )}
                            <div>
                              <div className="font-medium text-ink-900">{r.name}</div>
                              <div className="text-xs text-ink-400">
                                {r.idLabel}
                                {mode === "native" && <span className="ml-1">· {r.currency}</span>}
                              </div>
                            </div>
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
                          {totalText(r.rowTotal, r.currency)}
                        </td>
                      </tr>

                      {expandable &&
                        isOpen &&
                        r.subRows!.map((s) => (
                          <tr key={`${r.id}-${s.id}`} className="bg-ink-50/50">
                            <td className="sticky left-0 z-10 bg-ink-50 py-2 pl-12 pr-5">
                              <span
                                className={`text-sm ${
                                  s.isOther ? "italic text-ink-500" : "text-ink-700"
                                }`}
                              >
                                {s.name}
                              </span>
                            </td>
                            {s.cells.map((c, i) => (
                              <td
                                key={cols[i]?.key ?? i}
                                className={`px-4 py-2 text-right tnum ${
                                  c.value == null && !c.missingRate ? "text-ink-300" : "text-ink-600"
                                }`}
                              >
                                {cellText(c, r.currency)}
                              </td>
                            ))}
                            <td className="px-5 py-2 text-right tnum text-ink-700">
                              {totalText(s.rowTotal, r.currency)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
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
