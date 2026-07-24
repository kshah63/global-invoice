"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RATE_UNIT_LABELS,
  type Currency,
  type PayType,
  type RateUnit,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { SupplierMemberInvoice, SupplierMemberInvoiceItem } from "@/lib/types";
import {
  saveMemberInvoice,
  submitMemberInvoice,
  type MemberAdjustmentInput,
} from "@/actions/member-invoices";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";

export interface MemberPay {
  pay_type: PayType;
  monthly_salary: number;
  rate_unit: RateUnit;
  rate_amount: number;
  rate_descriptor: string | null;
}

type Direction = "add" | "subtract";
interface AdjRow {
  key: string;
  description: string;
  direction: Direction;
  amount: string;
}

let seq = 0;
const newKey = () => `a-${seq++}-${Math.round(Math.random() * 1e6)}`;

export function MemberInvoiceEditor({
  invoice,
  initialItems,
  pay,
  supplierName,
  paymentCurrency,
  fxRate,
}: {
  invoice: SupplierMemberInvoice;
  initialItems: SupplierMemberInvoiceItem[];
  pay: MemberPay;
  supplierName: string;
  paymentCurrency: Currency | null; // null / same as rate ccy → no conversion shown
  fxRate: number | null; // indicative rate: rate ccy -> payment ccy
}) {
  const router = useRouter();
  const currency = invoice.currency; // rate currency
  const isRate = pay.pay_type === "rate";
  const qtyLabel = pay.rate_unit === "per_session" ? "Sessions" : "Hours";

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [quantity, setQuantity] = useState(String(invoice.quantity ?? 0));
  const [adjustments, setAdjustments] = useState<AdjRow[]>(
    initialItems
      .filter((it) => it.task === "adjustment")
      .map((it) => {
        const amt = Number(it.rate_amount ?? 0);
        return {
          key: newKey(),
          description: it.note ?? it.rate_descriptor ?? "",
          direction: amt < 0 ? "subtract" : "add",
          amount: String(Math.abs(amt)),
        };
      })
  );
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const baseTotal = isRate
    ? (Number(pay.rate_amount) || 0) * (Number(quantity) || 0)
    : Number(pay.monthly_salary) || 0;

  const adjTotal = useMemo(
    () =>
      adjustments.reduce((sum, a) => {
        const mag = Math.abs(Number(a.amount) || 0);
        return sum + (a.direction === "subtract" ? -mag : mag);
      }, 0),
    [adjustments]
  );
  const grandTotal = Math.round((baseTotal + adjTotal) * 100) / 100;

  const showFx = paymentCurrency && paymentCurrency !== currency;
  const converted = showFx && fxRate != null ? grandTotal * fxRate : null;

  function patchAdj(key: string, p: Partial<AdjRow>) {
    setAdjustments((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function addAdj() {
    setAdjustments((prev) => [
      ...prev,
      { key: newKey(), description: "", direction: "subtract", amount: "" },
    ]);
  }
  function removeAdj(key: string) {
    setAdjustments((prev) => prev.filter((r) => r.key !== key));
  }

  async function doSave(): Promise<boolean> {
    setError(null);
    setNotice(null);
    const badAdj = adjustments.find((a) => !a.description.trim() || !(Number(a.amount) > 0));
    if (badAdj) {
      setError("Every adjustment needs a description and an amount greater than zero.");
      return false;
    }
    const payload: MemberAdjustmentInput[] = adjustments.map((a, i) => {
      const mag = Math.abs(Number(a.amount) || 0);
      return {
        note: a.description.trim(),
        rate_descriptor: a.description.trim(),
        rate_amount: a.direction === "subtract" ? -mag : mag,
        sort_order: i,
      };
    });
    const res = await saveMemberInvoice({
      invoiceId: invoice.id,
      displayName: displayName.trim() || invoice.display_name,
      notes: notes.trim() || null,
      quantity: isRate ? Number(quantity) || 0 : 0,
      adjustments: payload,
    });
    if (res.error) {
      setError(res.error);
      return false;
    }
    return true;
  }

  async function onSave() {
    setBusy("save");
    if (await doSave()) {
      setNotice("Saved.");
      router.refresh();
    }
    setBusy(null);
  }
  async function onSubmit() {
    setBusy("submit");
    if (await doSave()) {
      const res = await submitMemberInvoice(invoice.id);
      if (res.error) setError(res.error);
      else {
        setNotice("Confirmed and sent to your leader.");
        router.refresh();
      }
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {invoice.status === "returned" && invoice.return_note && (
        <Alert tone="warning" title="Sent back for correction">
          “{invoice.return_note}”
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Your pay · ${supplierName}`}
          description={
            isRate
              ? "Enter what you worked this month and add any adjustments, then confirm."
              : "Check your salary, add any adjustments, then confirm."
          }
          action={<MemberStatusBadge status={invoice.status} />}
        />
        <CardBody className="space-y-4">
          {isRate ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Your rate" hint={pay.rate_descriptor ?? undefined}>
                <Input
                  disabled
                  value={`${formatCurrency(pay.rate_amount, currency)} ${RATE_UNIT_LABELS[pay.rate_unit]}`}
                />
              </Field>
              <Field label={qtyLabel} required>
                <Input
                  type="number"
                  min="0"
                  step={pay.rate_unit === "per_hour" ? "0.25" : "0.5"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <div>
                <Label>Pay before adjustments</Label>
                <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                  {formatCurrency(baseTotal, currency)}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3">
              <span className="text-sm text-ink-500">Monthly salary</span>
              <span className="tnum text-lg font-semibold text-ink-900">
                {formatCurrency(baseTotal, currency)}
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Adjustments"
          description="e.g. an unpaid day off. Optional."
          action={
            <Button type="button" size="sm" variant="brand-soft" onClick={addAdj}>
              + Adjustment
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {adjustments.length === 0 && (
            <p className="text-sm text-ink-500">No adjustments this month.</p>
          )}
          {adjustments.map((a) => (
            <div
              key={a.key}
              className="grid gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-6">
                <Label>Description</Label>
                <Input
                  value={a.description}
                  onChange={(e) => patchAdj(a.key, { description: e.target.value })}
                  placeholder="Unpaid day off"
                />
              </div>
              <div className="sm:col-span-3">
                <Label>Type</Label>
                <Select
                  value={a.direction}
                  onChange={(e) => patchAdj(a.key, { direction: e.target.value as Direction })}
                >
                  <option value="subtract">Subtraction (−)</option>
                  <option value="add">Addition (+)</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Amount ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={a.amount}
                  onChange={(e) => patchAdj(a.key, { amount: e.target.value })}
                />
              </div>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => removeAdj(a.key)}
                  className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Notes for your leader">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything your leader should know"
              />
            </Field>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-t border-ink-200 pt-2 text-base">
                <span className="font-semibold text-ink-900">Total</span>
                <span className="tnum font-semibold text-ink-900">
                  {formatCurrency(grandTotal, currency)}
                </span>
              </div>
              {showFx && (
                <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  {converted != null ? (
                    <>
                      You&apos;re paid in {paymentCurrency}: ≈{" "}
                      <span className="font-medium text-ink-700">
                        {formatCurrency(converted, paymentCurrency!)}
                      </span>{" "}
                      at today&apos;s indicative rate. The final amount depends on the
                      exchange rate on your transfer day.
                    </>
                  ) : (
                    <>
                      You&apos;re paid in {paymentCurrency}. The converted amount will be
                      confirmed at the exchange rate on your transfer day.
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} variant="neutral" loading={busy === "save"} type="button">
          Save
        </Button>
        <Button onClick={onSubmit} loading={busy === "submit"} type="button">
          Confirm &amp; send to leader
        </Button>
        <span className="ml-auto text-xs text-ink-400">
          You can edit until your leader locks the month.
        </span>
      </div>
    </div>
  );
}
