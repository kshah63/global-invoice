"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { returnMemberInvoice } from "@/actions/member-invoices";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Currency, MemberInvoiceStatus } from "@/lib/constants";

export interface MemberSubEntry {
  id: string;
  label: string;
  sessions: number;
  hours: number;
  total: number;
}

export interface MemberSubmissionRow {
  id: string;
  memberName: string;
  status: MemberInvoiceStatus;
  total: number;
  currency: Currency;
  returnNote: string | null;
  items: MemberSubEntry[];
}

function SubmissionRow({ s }: { s: MemberSubmissionRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function sendBack() {
    const note = window.prompt("What should this member fix? (optional note)") ?? "";
    setBusy(true);
    setError(null);
    const res = await returnMemberInvoice(s.id, note);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-xl border border-ink-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-ink-900">{s.memberName}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <MemberStatusBadge status={s.status} />
            {s.status === "returned" && s.returnNote && (
              <span className="text-xs text-ink-400">“{s.returnNote}”</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
            aria-expanded={open}
          >
            {open ? "Hide entries" : "View entries"}
          </button>
          <span className="tnum text-sm font-medium">
            {formatCurrency(s.total, s.currency)}
          </span>
          {s.status === "submitted" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={sendBack}
            >
              Send back
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-ink-100 bg-ink-50/40">
          {s.items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-400">No line items recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2 font-semibold">Entry</th>
                  <th className="px-3 py-2 text-right font-semibold">Sessions</th>
                  <th className="px-3 py-2 text-right font-semibold">Hours</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {s.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">{it.label}</td>
                    <td className="px-3 py-2 text-right tnum">
                      {it.sessions ? formatNumber(it.sessions) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      {it.hours ? formatNumber(it.hours) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      {formatCurrency(it.total, s.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && <Alert tone="danger" className="mt-2">{error}</Alert>}
    </div>
  );
}

export function MemberSubmissionsPanel({
  submissions,
}: {
  consolidatedInvoiceId?: string;
  submissions: MemberSubmissionRow[];
}) {
  const submittedCount = submissions.filter((s) => s.status === "submitted").length;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Member submissions"
        description={
          submittedCount > 0
            ? `${submittedCount} ready to pull into this invoice. Use “Pull in” below, or send one back to fix.`
            : "Each roster member's own entries appear here once they submit."
        }
      />
      <CardBody className="space-y-3">
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-500">No members have submitted yet.</p>
        ) : (
          submissions.map((s) => <SubmissionRow key={s.id} s={s} />)
        )}
      </CardBody>
    </Card>
  );
}
