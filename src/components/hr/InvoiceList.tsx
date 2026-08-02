"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import {
  INVOICE_STATUSES,
  STATUS_META,
  periodLabel,
  type Currency,
  type InvoiceStatus,
} from "@/lib/constants";

export interface InvoiceRow {
  id: string;
  name: string;
  employee_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  total: number;
  currency: Currency;
  year: number;
  month: number;
}

type Scope = "period" | "all";
type Sort = "name" | "total_desc" | "total_asc" | "status" | "period_desc";

const STATUS_ORDER: Record<InvoiceStatus, number> = INVOICE_STATUSES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<InvoiceStatus, number>
);

export function InvoiceList({
  rows,
  selectedYear,
  selectedMonth,
}: {
  rows: InvoiceRow[];
  selectedYear: number;
  selectedMonth: number;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [scope, setScope] = useState<Scope>("period");
  const [sort, setSort] = useState<Sort>("name");

  const scoped = useMemo(
    () =>
      scope === "all"
        ? rows
        : rows.filter((r) => r.year === selectedYear && r.month === selectedMonth),
    [rows, scope, selectedYear, selectedMonth]
  );

  // Only offer status options that appear in the current scope.
  const presentStatuses = useMemo(() => {
    const set = new Set(scoped.map((r) => r.status));
    return INVOICE_STATUSES.filter((s) => set.has(s));
  }, [scoped]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = scoped.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.employee_id ?? "").toLowerCase().includes(needle) ||
        r.invoice_number.toLowerCase().includes(needle)
      );
    });
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "total_desc":
          return b.total - a.total;
        case "total_asc":
          return a.total - b.total;
        case "status":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
        case "period_desc":
          return b.year - a.year || b.month - a.month || a.name.localeCompare(b.name);
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [scoped, q, status, sort]);

  const showPeriod = scope === "all";
  const clear = q || status !== "all";

  return (
    <>
      {/* Scope toggle */}
      <div className="mb-4 inline-flex rounded-xl border border-ink-200 bg-white p-0.5 text-sm">
        {(
          [
            ["period", `${periodLabel(selectedYear, selectedMonth)}`],
            ["all", "All periods"],
          ] as [Scope, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setScope(key);
              if (key === "period" && sort === "period_desc") setSort("name");
            }}
            className={
              scope === key
                ? "rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white"
                : "rounded-lg px-3 py-1.5 font-medium text-ink-600 hover:bg-ink-100"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
            🔍
          </span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ID or invoice number"
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | InvoiceStatus)}
            className="w-40"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {presentStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="w-44"
            aria-label="Sort invoices"
          >
            <option value="name">Sort: Name (A–Z)</option>
            <option value="total_desc">Sort: Total (high → low)</option>
            <option value="total_asc">Sort: Total (low → high)</option>
            <option value="status">Sort: Status</option>
            {scope === "all" && <option value="period_desc">Sort: Newest period</option>}
          </Select>
          {clear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setStatus("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={scoped.length === 0 ? "No invoices here yet" : "No matching invoices"}
                description={
                  scoped.length === 0
                    ? "Invoices will appear here once team members create them."
                    : "Try a different search, status or scope."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Team member</th>
                    {showPeriod && <th className="px-5 py-3 font-semibold">Period</th>}
                    <th className="px-5 py-3 font-semibold">Invoice #</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink-900">{inv.name}</div>
                        <div className="text-xs text-ink-400">{inv.employee_id}</div>
                      </td>
                      {showPeriod && (
                        <td className="px-5 py-3 text-ink-600">
                          {periodLabel(inv.year, inv.month)}
                        </td>
                      )}
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/hr/invoices/${inv.id}`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
