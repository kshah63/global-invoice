"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  returnMemberInvoice,
  recordMemberInvoiceFx,
} from "@/actions/member-invoices";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Currency, MemberInvoiceStatus } from "@/lib/constants";

export interface MemberSubmissionRow {
  id: string;
  memberName: string;
  status: MemberInvoiceStatus;
  total: number;
  currency: Currency; // rate currency
  returnNote: string | null;
  paymentCurrency: Currency | null;
  indicativeRate: number | null; // live rate: rate ccy -> payment ccy
  fxRate: number | null; // recorded actual
  fxRateDate: string | null;
}

function SubmissionRow({
  s,
  canManageFx,
}: {
  s: MemberSubmissionRow;
  canManageFx: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "return" | "fx">(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(s.fxRate != null ? String(s.fxRate) : "");
  const [date, setDate] = useState(s.fxRateDate ?? "");

  const showFx = s.paymentCurrency && s.paymentCurrency !== s.currency;
  const preview =
    Number(rate) > 0
      ? s.total * Number(rate)
      : s.indicativeRate != null
        ? s.total * s.indicativeRate
        : null;

  async function sendBack() {
    const note = window.prompt("What should this member fix? (optional note)") ?? "";
    setBusy("return");
    setError(null);
    const res = await returnMemberInvoice(s.id, note);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }
  async function saveFx(clear = false) {
    setBusy("fx");
    setError(null);
    const res = await recordMemberInvoiceFx(
      s.id,
      clear ? null : Number(rate) || null,
      clear ? null : date || null
    );
    setBusy(null);
    if (res.error) setError(res.error);
    else {
      if (clear) {
        setRate("");
        setDate("");
      }
      router.refresh();
    }
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
        <div className="flex items-center gap-4">
          <span className="tnum text-sm font-medium">
            {formatCurrency(s.total, s.currency)}
          </span>
          {s.status === "submitted" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={busy === "return"}
              onClick={sendBack}
            >
              Send back
            </Button>
          )}
        </div>
      </div>

      {error && <Alert tone="danger" className="mt-2">{error}</Alert>}

      {showFx && (
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
          <div>
            Paid in {s.paymentCurrency}:{" "}
            <span className="font-medium text-ink-700">
              {preview != null ? formatCurrency(preview, s.paymentCurrency!) : "—"}
            </span>{" "}
            {s.fxRate != null
              ? `at the recorded rate (${formatNumber(s.fxRate)}${s.fxRateDate ? `, ${s.fxRateDate}` : ""}).`
              : s.indicativeRate != null
                ? "— indicative at today's rate."
                : "— confirmed on the transfer day."}
          </div>
          {canManageFx && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[0.65rem] uppercase tracking-wide text-ink-400">
                  Rate (1 {s.currency} → {s.paymentCurrency})
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  className="h-8 w-28 text-xs"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder={s.indicativeRate != null ? String(s.indicativeRate) : ""}
                />
              </div>
              <div>
                <label className="block text-[0.65rem] uppercase tracking-wide text-ink-400">
                  Transfer date
                </label>
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" loading={busy === "fx"} onClick={() => saveFx(false)}>
                Save rate
              </Button>
              {s.fxRate != null && (
                <Button type="button" size="sm" variant="ghost" onClick={() => saveFx(true)}>
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberSubmissionsPanel({
  submissions,
  canManageFx = true,
}: {
  consolidatedInvoiceId?: string;
  submissions: MemberSubmissionRow[];
  canManageFx?: boolean;
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
          submissions.map((s) => (
            <SubmissionRow key={s.id} s={s} canManageFx={canManageFx} />
          ))
        )}
      </CardBody>
    </Card>
  );
}
