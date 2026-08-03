"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Currency, DashboardStatus } from "@/lib/constants";

export interface ReportLine {
  member: string;
  label: string;
  sessions: number;
  hours: number;
  amount: number;
}

export interface ReportRow {
  id: string;
  name: string;
  idLabel: string;
  status: DashboardStatus;
  currency: Currency;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  invoiceId: string | null;
  isSupplier: boolean;
  lines: ReportLine[];
}

export function ReportTable({ rows }: { rows: ReportRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandableIds = rows.filter((r) => r.isSupplier && r.lines.length > 0).map((r) => r.id);
  const allOpen = expandableIds.length > 0 && expandableIds.every((id) => open.has(id));

  return (
    <Card>
      <CardHeader
        title="Team members"
        description="Finalised = approved or paid. Only these count in the payable totals. Click a supplier to see its line items."
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
            <EmptyState title="No active team members" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="px-5 py-3 font-semibold">Team member</th>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Subtotal</th>
                  <th className="px-5 py-3 text-right font-semibold">Tax</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => {
                  const expandable = r.isSupplier && r.lines.length > 0;
                  const isOpen = open.has(r.id);
                  const nameEl = r.invoiceId ? (
                    <Link
                      href={`/hr/invoices/${r.invoiceId}`}
                      className="hover:text-brand-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  );
                  return (
                    <FragmentRow
                      key={r.id}
                      r={r}
                      expandable={expandable}
                      isOpen={isOpen}
                      onToggle={() => expandable && toggle(r.id)}
                      nameEl={nameEl}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FragmentRow({
  r,
  expandable,
  isOpen,
  onToggle,
  nameEl,
}: {
  r: ReportRow;
  expandable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  nameEl: React.ReactNode;
}) {
  return (
    <>
      <tr
        className={expandable ? "cursor-pointer hover:bg-ink-50" : "hover:bg-ink-50"}
        onClick={onToggle}
      >
        <td className="px-5 py-3 font-medium text-ink-900">
          <div className="flex items-center gap-2">
            {expandable ? (
              <span
                aria-hidden
                className={`inline-block text-ink-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
              >
                ▸
              </span>
            ) : (
              <span className="inline-block w-[1ch]" />
            )}
            {nameEl}
          </div>
        </td>
        <td className="px-5 py-3 font-mono text-xs text-ink-500">{r.idLabel}</td>
        <td className="px-5 py-3">
          <StatusPill status={r.status} />
        </td>
        <td className="px-5 py-3 text-right tnum">
          {r.subtotal != null ? formatCurrency(r.subtotal, r.currency) : "—"}
        </td>
        <td className="px-5 py-3 text-right tnum">
          {r.tax != null ? formatCurrency(r.tax, r.currency) : "—"}
        </td>
        <td className="px-5 py-3 text-right font-medium tnum">
          {r.total != null ? formatCurrency(r.total, r.currency) : "—"}
        </td>
      </tr>
      {expandable && isOpen && (
        <tr className="bg-ink-50/60">
          <td colSpan={6} className="px-5 py-3">
            <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2 font-semibold">Roster member</th>
                    <th className="px-4 py-2 font-semibold">Line item</th>
                    <th className="px-4 py-2 text-right font-semibold">Sessions</th>
                    <th className="px-4 py-2 text-right font-semibold">Hours</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {r.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-ink-700">{l.member}</td>
                      <td className="px-4 py-2 text-ink-600">{l.label}</td>
                      <td className="px-4 py-2 text-right tnum">
                        {l.sessions ? formatNumber(l.sessions) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tnum">
                        {l.hours ? formatNumber(l.hours) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tnum">
                        {formatCurrency(l.amount, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
