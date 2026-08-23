"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reverseAndCarryInvoice, undoReverseAndCarry } from "@/actions/reversal";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export interface CarriedInfo {
  targetInvoiceId: string;
  targetInvoiceNumber: string;
  targetPeriodLabel: string;
  amount: number;
}

export function ReversalCarryCard({
  invoiceId,
  status,
  currency,
  defaultAmount,
  nextPeriodLabel,
  carried,
}: {
  invoiceId: string;
  status: "paid" | "reversed";
  currency: Currency;
  defaultAmount: number;
  nextPeriodLabel: string;
  carried: CarriedInfo | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "carry" | "undo">(null);
  const [error, setError] = useState<string | null>(null);

  async function onCarry() {
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (
      !window.confirm(
        `Mark this payment reversed and carry ${formatCurrency(amt, currency)} into ${nextPeriodLabel}?\n\n` +
          `This month's invoice becomes "Reversed" (no longer counted as paid) and the amount is added to the employee's ${nextPeriodLabel} invoice.`
      )
    ) {
      return;
    }
    setBusy("carry");
    setError(null);
    const res = await reverseAndCarryInvoice(invoiceId, amt, note.trim() || null);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function onUndo() {
    if (
      !window.confirm(
        "Undo this reversal? The carried-forward line is removed from next month and this invoice returns to Paid."
      )
    ) {
      return;
    }
    setBusy("undo");
    setError(null);
    const res = await undoReverseAndCarry(invoiceId);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  if (status === "reversed") {
    return (
      <Card className="mb-6 border-rose-200">
        <CardHeader
          title="Payment reversed"
          description="The bank transfer bounced, so this amount was carried into next month's invoice."
        />
        <CardBody className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {carried ? (
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-600">
                  Carried into{" "}
                  <span className="font-medium text-ink-900">{carried.targetPeriodLabel}</span> ·{" "}
                  <Link
                    href={`/hr/invoices/${carried.targetInvoiceId}`}
                    className="font-mono text-brand-600 hover:underline"
                  >
                    {carried.targetInvoiceNumber}
                  </Link>
                </span>
                <span className="tnum font-semibold text-ink-900">
                  {formatCurrency(carried.amount, currency)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              This invoice is marked reversed. The carried line may have been removed manually.
            </p>
          )}
          <div>
            <Button type="button" variant="neutral" size="sm" loading={busy === "undo"} onClick={onUndo}>
              Undo reversal
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Payment reversed?"
        description="If the bank bounced this transfer, carry the amount into next month's invoice instead of it counting as paid."
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Amount to carry ({currency})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-400">
              Defaults to the full invoice total. Lower it for a partial reversal.
            </p>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bank reversed on 15 Aug"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="danger" size="sm" loading={busy === "carry"} onClick={onCarry}>
            Reverse &amp; carry to {nextPeriodLabel}
          </Button>
          <span className="text-xs text-ink-400">
            Marks this invoice “Reversed” and adds the amount to the employee&apos;s {nextPeriodLabel} invoice.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
