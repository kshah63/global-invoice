"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import { INVOICE_STATUSES, STATUS_META, type Currency, type InvoiceStatus } from "@/lib/constants";

export interface InvoiceRow {
  id: string;
  name: string;
  employee_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  total: number;
  currency: Currency;
}

export function InvoiceList({ rows }: { rows: InvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");

  // Only offer status options that actually appear this period.
  const presentStatuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.status));
    return INVOICE_STATUSES.filter((s) => set.has(s));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.employee_id ?? "").toLowerCase().includes(needle) ||
        r.invoice_number.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status]);

  const clear = q || status !== "all";

  return (
    <>
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
            className="w-44"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {presentStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
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
                title={rows.length === 0 ? "No invoices for this period" : "No matching invoices"}
                description={
                  rows.length === 0
                    ? "Invoices will appear here once team members create them."
                    : "Try a different search or status filter."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Team member</th>
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
