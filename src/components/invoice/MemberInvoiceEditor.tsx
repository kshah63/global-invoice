"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CENTRES,
  ADJUSTMENT_TASK,
  SUPPLIER_TASKS,
  RATE_UNIT_LABELS,
  TASK_LABELS,
  type Centre,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { computeInvoiceTotals, computeLineTotal } from "@/lib/invoice";
import { formatCurrency } from "@/lib/format";
import type { SupplierMemberInvoice, SupplierMemberInvoiceItem } from "@/lib/types";
import {
  saveMemberInvoice,
  submitMemberInvoice,
  type SaveMemberInvoiceItem,
} from "@/actions/member-invoices";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";

export interface MemberRate {
  id: string;
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
}

type Direction = "add" | "subtract";
interface Row {
  key: string;
  centre: Centre;
  task: TaskType;
  note: string;
  sessions: string;
  hours: string;
  rate_id: string;
  rate_descriptor: string;
  rate_unit: RateUnit;
  rate_amount: number; // adjustment rows: positive magnitude
  direction: Direction;
}

let seq = 0;
const newKey = () => `m-${seq++}-${Math.round(Math.random() * 1e6)}`;

function toRow(it: SupplierMemberInvoiceItem): Row {
  const amt = Number(it.rate_amount ?? 0);
  const isAdj = it.task === ADJUSTMENT_TASK;
  return {
    key: newKey(),
    centre: it.centre,
    task: it.task,
    note: it.note ?? "",
    sessions: String(it.sessions ?? 0),
    hours: String(it.hours ?? 0),
    rate_id: it.rate_id ?? "",
    rate_descriptor: it.rate_descriptor ?? "",
    rate_unit: it.rate_unit,
    rate_amount: isAdj ? Math.abs(amt) : amt,
    direction: isAdj && amt < 0 ? "subtract" : "add",
  };
}

export function MemberInvoiceEditor({
  invoice,
  initialItems,
  rates,
  supplierName,
}: {
  invoice: SupplierMemberInvoice;
  initialItems: SupplierMemberInvoiceItem[];
  rates: MemberRate[];
  supplierName: string;
}) {
  const router = useRouter();
  const currency = invoice.currency;

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [rows, setRows] = useState<Row[]>(initialItems.map(toRow));
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rateById = useMemo(() => {
    const m = new Map<string, MemberRate>();
    rates.forEach((r) => m.set(r.id, r));
    return m;
  }, [rates]);

  function rowTotal(r: Row): number {
    if (r.task === ADJUSTMENT_TASK) {
      const mag = Math.abs(Number(r.rate_amount) || 0);
      return r.direction === "subtract" ? -mag : mag;
    }
    return computeLineTotal({
      rate_unit: r.rate_unit,
      rate_amount: r.rate_amount,
      sessions: Number(r.sessions) || 0,
      hours: Number(r.hours) || 0,
    });
  }
  const lineTotals = rows.map(rowTotal);
  const totals = useMemo(
    () => computeInvoiceTotals(lineTotals, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineTotals)]
  );

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function addWorkLine() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        centre: "MathVision",
        task: "teaching",
        note: "",
        sessions: "",
        hours: "",
        rate_id: "",
        rate_descriptor: "",
        rate_unit: "per_session",
        rate_amount: 0,
        direction: "subtract",
      },
    ]);
  }
  function addAdjustment() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        centre: "MathVision",
        task: ADJUSTMENT_TASK,
        note: "",
        sessions: "0",
        hours: "0",
        rate_id: "",
        rate_descriptor: "",
        rate_unit: "fixed",
        rate_amount: 0,
        direction: "subtract",
      },
    ]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }
  function changeRate(key: string, rateId: string) {
    const rate = rateById.get(rateId);
    if (!rate) {
      patch(key, { rate_id: "", rate_descriptor: "", rate_amount: 0 });
      return;
    }
    patch(key, {
      rate_id: rate.id,
      rate_descriptor: rate.descriptor,
      rate_unit: rate.unit,
      rate_amount: Number(rate.amount),
      task: (rate.task ?? undefined) ?? ("teaching" as TaskType),
    });
  }

  function buildItems(): SaveMemberInvoiceItem[] {
    return rows.map((r, i) => {
      if (r.task === ADJUSTMENT_TASK) {
        const mag = Math.abs(Number(r.rate_amount) || 0);
        const signed = r.direction === "subtract" ? -mag : mag;
        const description = r.note.trim();
        return {
          centre: "MathVision",
          task: ADJUSTMENT_TASK,
          note: description || null,
          sessions: 0,
          hours: 0,
          rate_id: null,
          rate_descriptor: description || "Adjustment",
          rate_unit: "fixed",
          rate_amount: signed,
          sort_order: i,
        };
      }
      return {
        centre: r.centre,
        task: r.task,
        note: r.note.trim() || null,
        sessions: Number(r.sessions) || 0,
        hours: Number(r.hours) || 0,
        rate_id: r.rate_id || null,
        rate_descriptor: r.rate_descriptor || null,
        rate_unit: r.rate_unit,
        rate_amount: r.rate_amount || 0,
        sort_order: i,
      };
    });
  }

  async function doSave(): Promise<boolean> {
    setError(null);
    setNotice(null);
    const badLine = rows.find((r) => r.task !== ADJUSTMENT_TASK && !r.rate_id);
    if (badLine) {
      setError("Every work line needs a rate selected.");
      return false;
    }
    const badAdj = rows.find(
      (r) =>
        r.task === ADJUSTMENT_TASK && (!r.note.trim() || !(Number(r.rate_amount) > 0))
    );
    if (badAdj) {
      setError("Every adjustment needs a description and an amount greater than zero.");
      return false;
    }
    const res = await saveMemberInvoice({
      invoiceId: invoice.id,
      displayName: displayName.trim() || invoice.display_name,
      notes: notes.trim() || null,
      items: buildItems(),
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
      setNotice("Draft saved.");
      router.refresh();
    }
    setBusy(null);
  }
  async function onSubmit() {
    if (rows.length === 0) {
      setError("Add at least one line before submitting.");
      return;
    }
    setBusy("submit");
    if (await doSave()) {
      const res = await submitMemberInvoice(invoice.id);
      if (res.error) setError(res.error);
      else {
        setNotice("Sent to your leader.");
        router.refresh();
      }
    }
    setBusy(null);
  }

  const noRates = rates.length === 0;

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {invoice.status === "returned" && invoice.return_note && (
        <Alert tone="warning" title="Sent back for correction">
          “{invoice.return_note}”
        </Alert>
      )}
      {noRates && (
        <Alert tone="warning" title="No rates set up">
          Your HR team hasn&apos;t set up any rates for you yet. You can still
          add adjustments, but ask them to add your rates so your work lines can
          be calculated.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Your entries · billed to ${supplierName}`}
          description="Add a line per rate you worked, plus any adjustments (e.g. an unpaid day off)."
          action={<MemberStatusBadge status={invoice.status} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name shown on your invoice" hint="Defaults to your name.">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Line items"
          action={
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="brand-soft" onClick={addWorkLine}>
                + Work line
              </Button>
              <Button type="button" size="sm" variant="neutral" onClick={addAdjustment}>
                + Adjustment
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center text-sm text-ink-500">
              No lines yet. Add a <strong>work line</strong> or an{" "}
              <strong>adjustment</strong>.
            </p>
          )}

          {rows.map((row, i) => {
            const total = lineTotals[i];
            const isAdjustment = row.task === ADJUSTMENT_TASK;
            const fixed = row.rate_unit === "fixed";
            return (
              <div key={row.key} className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {isAdjustment ? `Adjustment ${i + 1}` : `Work line ${i + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>

                {isAdjustment ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Description" required>
                      <Input
                        value={row.note}
                        onChange={(e) => patch(row.key, { note: e.target.value })}
                        placeholder="Unpaid day off"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Type">
                        <Select
                          value={row.direction}
                          onChange={(e) =>
                            patch(row.key, { direction: e.target.value as Direction })
                          }
                        >
                          <option value="subtract">Subtraction (−)</option>
                          <option value="add">Addition (+)</option>
                        </Select>
                      </Field>
                      <Field label={`Amount (${currency})`} hint="A positive number.">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.rate_amount ? String(row.rate_amount) : ""}
                          onChange={(e) =>
                            patch(row.key, { rate_amount: Number(e.target.value) })
                          }
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm">
                      <span className="text-ink-500">Line total</span>
                      <span className="font-medium tnum">{formatCurrency(total, currency)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Centre">
                        <Select
                          value={row.centre}
                          onChange={(e) => patch(row.key, { centre: e.target.value as Centre })}
                        >
                          {CENTRES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label="Rate"
                        hint={
                          row.rate_id
                            ? `${formatCurrency(row.rate_amount, currency)} ${RATE_UNIT_LABELS[row.rate_unit]}`
                            : "Pick one of your rates."
                        }
                      >
                        <Select
                          value={row.rate_id}
                          onChange={(e) => changeRate(row.key, e.target.value)}
                        >
                          <option value="">— Select rate —</option>
                          {rates.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.descriptor} · {formatCurrency(Number(r.amount), currency)}{" "}
                              {RATE_UNIT_LABELS[r.unit]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <Field label="Task">
                        <Select
                          value={row.task}
                          onChange={(e) => patch(row.key, { task: e.target.value as TaskType })}
                        >
                          {SUPPLIER_TASKS.map((t) => (
                            <option key={t} value={t}>
                              {TASK_LABELS[t]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {!fixed && (
                        <>
                          <div>
                            <Label>Sessions</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={row.sessions}
                              onChange={(e) => patch(row.key, { sessions: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Hours</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.25"
                              value={row.hours}
                              onChange={(e) => patch(row.key, { hours: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <Label>Line total</Label>
                        <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                          {formatCurrency(total, currency)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Field label="Note">
                        <Input
                          value={row.note}
                          onChange={(e) => patch(row.key, { note: e.target.value })}
                          placeholder="Optional description"
                        />
                      </Field>
                    </div>
                  </>
                )}
              </div>
            );
          })}
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
                  {formatCurrency(totals.total, currency)}
                </span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} variant="neutral" loading={busy === "save"} type="button">
          Save draft
        </Button>
        <Button onClick={onSubmit} loading={busy === "submit"} type="button">
          Save &amp; send to leader
        </Button>
        <span className="ml-auto text-xs text-ink-400">
          You can edit until your leader locks the month.
        </span>
      </div>
    </div>
  );
}
