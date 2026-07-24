"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordInvoiceFx } from "@/actions/invoices";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";

/**
 * HR records the actual FX rate + date used to pay an invoice whose payout
 * currency differs from its rate currency. Until set, the person sees an
 * indicative amount at the live rate.
 */
export function PayoutFxCard({
  invoiceId,
  total,
  rateCurrency,
  paymentCurrency,
  indicativeRate,
  initialRate,
  initialDate,
}: {
  invoiceId: string;
  total: number;
  rateCurrency: Currency;
  paymentCurrency: Currency;
  indicativeRate: number | null;
  initialRate: number | null;
  initialDate: string | null;
}) {
  const router = useRouter();
  const [rate, setRate] = useState(initialRate != null ? String(initialRate) : "");
  const [date, setDate] = useState(initialDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preview = Number(rate) > 0 ? total * Number(rate) : null;

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await recordInvoiceFx(
      invoiceId,
      clear ? null : Number(rate) || null,
      clear ? null : date || null
    );
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      if (clear) {
        setRate("");
        setDate("");
      }
      setNotice(clear ? "Cleared — showing the indicative rate again." : "Saved.");
      router.refresh();
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Payout exchange rate"
        description={`This invoice is in ${rateCurrency} but paid in ${paymentCurrency}. Record the actual rate used on the transfer day to lock the final amount.`}
      />
      <CardBody className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {indicativeRate != null && (
          <p className="text-xs text-ink-500">
            Today&apos;s indicative rate: 1 {rateCurrency} ≈ {indicativeRate} {paymentCurrency}.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Rate (1 ${rateCurrency} = ? ${paymentCurrency})`}>
            <Input
              type="number"
              min="0"
              step="0.000001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={indicativeRate != null ? String(indicativeRate) : "e.g. 61.5"}
            />
          </Field>
          <Field label="Transfer date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-ink-400">Final</div>
              <div className="tnum font-medium">
                {preview != null ? formatCurrency(preview, paymentCurrency) : "—"}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" loading={busy} onClick={() => save(false)}>
            Save rate
          </Button>
          {initialRate != null && (
            <Button type="button" size="sm" variant="ghost" onClick={() => save(true)}>
              Clear
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
