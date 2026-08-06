"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RATE_UNIT_LABELS, type PayType, type RateUnit, type TaskType } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { TransferNote } from "@/components/TransferNote";
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

export interface MemberRate {
  id: string;
  descriptor: string | null;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
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
  payType,
  monthlySalary,
  rates,
  supplierName,
  role,
}: {
  invoice: SupplierMemberInvoice;
  initialItems: SupplierMemberInvoiceItem[];
  payType: PayType;
  monthlySalary: number;
  rates: MemberRate[];
  supplierName: string;
  role?: string | null;
}) {
  const router = useRouter();
  const currency = invoice.currency; // rate currency
  const isRate = payType === "rate";
  // Only teachers log sessions/hours for the tracker cross-check.
  const logSessions = !isRate && role === "teacher";

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  // Worked quantity per rate, reconstructed from any saved base lines.
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    rates.forEach((r) => {
      const it = initialItems.find((x) => x.task !== "adjustment" && x.rate_id === r.id);
      const q = it ? Number(it.sessions ?? 0) + Number(it.hours ?? 0) : 0;
      out[r.id] = q ? String(q) : "";
    });
    return out;
  });
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
  // Fixed-salary members still log sessions/hours (record only, for the
  // teaching-tracker cross-check).
  const fixedItem = initialItems.find((x) => x.task === "fixed_salary");
  const [fixedSessions, setFixedSessions] = useState<string>(
    fixedItem?.sessions ? String(fixedItem.sessions) : ""
  );
  const [fixedHours, setFixedHours] = useState<string>(
    fixedItem?.hours ? String(fixedItem.hours) : ""
  );
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const baseTotal = isRate
    ? rates.reduce((sum, r) => sum + (Number(r.amount) || 0) * (Number(qtys[r.id]) || 0), 0)
    : monthlySalary;

  const adjTotal = useMemo(
    () =>
      adjustments.reduce((sum, a) => {
        const mag = Math.abs(Number(a.amount) || 0);
        return sum + (a.direction === "subtract" ? -mag : mag);
      }, 0),
    [adjustments]
  );
  const grandTotal = Math.round((baseTotal + adjTotal) * 100) / 100;

  function setQty(rateId: string, value: string) {
    setQtys((prev) => ({ ...prev, [rateId]: value }));
  }
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
    const adjPayload: MemberAdjustmentInput[] = adjustments.map((a, i) => {
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
      lines: isRate
        ? rates.map((r) => ({ rate_id: r.id, quantity: Number(qtys[r.id]) || 0 }))
        : [],
      adjustments: adjPayload,
      fixedSessions: isRate ? undefined : Number(fixedSessions) || 0,
      fixedHours: isRate ? undefined : Number(fixedHours) || 0,
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
    if (logSessions && (!(Number(fixedSessions) > 0) || !(Number(fixedHours) > 0))) {
      setError("Enter the sessions and hours you worked this month before confirming.");
      return;
    }
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
              ? "Enter what you worked at each rate this month and add any adjustments, then confirm."
              : "Check your salary, add any adjustments, then confirm."
          }
          action={<MemberStatusBadge status={invoice.status} />}
        />
        <CardBody className="space-y-4">
          {isRate ? (
            rates.length === 0 ? (
              <Alert tone="warning">
                No rates have been set for you yet. Ask your leader or HR to add them.
              </Alert>
            ) : (
              <div className="space-y-3">
                {rates.map((r) => {
                  const qtyLabel = r.unit === "per_session" ? "Sessions" : "Hours";
                  const lineTotal = (Number(r.amount) || 0) * (Number(qtys[r.id]) || 0);
                  return (
                    <div
                      key={r.id}
                      className="grid items-end gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-12"
                    >
                      <div className="sm:col-span-5">
                        <Label>{r.descriptor || "Rate"}</Label>
                        <div className="flex h-10 items-center text-sm text-ink-600">
                          {formatCurrency(r.amount, currency)}{" "}
                          <span className="ml-1 text-ink-400">{RATE_UNIT_LABELS[r.unit]}</span>
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>{qtyLabel}</Label>
                        <Input
                          type="number"
                          min="0"
                          step={r.unit === "per_hour" ? "0.25" : "0.5"}
                          value={qtys[r.id] ?? ""}
                          onChange={(e) => setQty(r.id, e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <Label>Line total</Label>
                        <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                          {formatCurrency(lineTotal, currency)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-1 text-sm">
                  <span className="text-ink-500">Pay before adjustments</span>
                  <span className="tnum font-medium">{formatCurrency(baseTotal, currency)}</span>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3">
                <span className="text-sm text-ink-500">Monthly salary</span>
                <span className="tnum text-lg font-semibold text-ink-900">
                  {formatCurrency(baseTotal, currency)}
                </span>
              </div>
              {logSessions && (
              <div className="grid gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-2">
                <div>
                  <Label>
                    Sessions worked <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={fixedSessions}
                    onChange={(e) => setFixedSessions(e.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    Hours worked <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={fixedHours}
                    onChange={(e) => setFixedHours(e.target.value)}
                  />
                </div>
                <p className="text-xs text-ink-400 sm:col-span-2">
                  Required for our records (cross-checked against the teaching tracker). This
                  doesn&apos;t change your salary.
                </p>
              </div>
              )}
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
              <TransferNote currency={currency} />
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
