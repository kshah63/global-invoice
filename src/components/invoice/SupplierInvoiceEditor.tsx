"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SUPPLIER_TASKS,
  ADJUSTMENT_TASK,
  RATE_UNIT_LABELS,
  TASK_LABELS,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { computeInvoiceTotals, computeLineTotal } from "@/lib/invoice";
import { formatCurrency } from "@/lib/format";
import type { Invoice, InvoiceLineItem } from "@/lib/types";
import { saveSupplierInvoice, submitInvoiceById, type SaveSupplierItem } from "@/actions/invoices";
import { uploadReceipt } from "@/actions/receipts";
import { pullMemberInvoices } from "@/actions/member-invoices";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { StatusPill } from "@/components/ui/Badge";

export interface RosterPerson {
  id: string;
  name: string;
  role?: string | null;
  rates: { id: string; descriptor: string; unit: RateUnit; amount: number; task: TaskType | null }[];
}

type Kind = "person" | "adjustment" | "expense";
type Direction = "add" | "subtract";
interface Row {
  key: string;
  kind: Kind;
  supplier_member_id: string; // person line: who did the work; adjustment: who it's for ("" = general)
  rate_id: string;
  rate_unit: RateUnit;
  rate_amount: number;
  rate_descriptor: string;
  sessions: string;
  hours: string;
  amount: string; // adjustment/expense lines: positive magnitude (sign comes from `direction`)
  direction: Direction; // adjustment lines only
  task: TaskType;
  note: string; // adjustment/expense lines: the (required) description
  source_member_invoice_id: string; // set when imported from a member submission ("" otherwise)
  receipt_path: string; // expense lines: storage path of the uploaded receipt ("" = none)
  receipt_name: string; // expense lines: filename to show once attached
  item_id: string; // persisted line-item id (for the receipt View link); "" when new
}

let seq = 0;
const newKey = () => `s-${seq++}-${Math.round(Math.random() * 1e6)}`;

// Reconstruct an editor row from a saved line item. Adjustments are stored as
// task 'adjustment'; older "misc" flat lines (no person, fixed unit) are also
// treated as adjustments. For person lines we recover the rate_id by matching
// the saved snapshot against the roster, since the rate_id column isn't
// persisted (it's FK'd to individual rates) — without this, re-saving after a
// reload would zero the rate.
function toRow(it: InvoiceLineItem, roster: RosterPerson[]): Row {
  const amt = Number(it.rate_amount ?? 0);
  const fixed = it.rate_unit === "fixed";

  // Expense claims come first: they're fixed-unit lines with task 'misc_expenses'
  // and would otherwise be misread as adjustments below.
  if (it.task === "misc_expenses") {
    return {
      key: newKey(),
      kind: "expense",
      supplier_member_id: "",
      rate_id: "",
      rate_unit: "fixed",
      rate_amount: amt,
      rate_descriptor: it.rate_descriptor ?? "",
      sessions: "0",
      hours: "0",
      amount: String(Math.abs(amt)),
      direction: "add",
      task: "misc_expenses",
      note: it.note ?? "",
      source_member_invoice_id: it.source_member_invoice_id ?? "",
      receipt_path: it.receipt_path ?? "",
      receipt_name: it.receipt_path ? "Receipt attached" : "",
      item_id: it.id,
    };
  }

  const isAdjustment = it.task === ADJUSTMENT_TASK || (!it.supplier_member_id && fixed);

  if (isAdjustment) {
    return {
      key: newKey(),
      kind: "adjustment",
      supplier_member_id: it.supplier_member_id ?? "",
      rate_id: "",
      rate_unit: "fixed",
      rate_amount: amt,
      rate_descriptor: it.rate_descriptor ?? "",
      sessions: "0",
      hours: "0",
      amount: String(Math.abs(amt)),
      direction: amt < 0 ? "subtract" : "add",
      task: ADJUSTMENT_TASK,
      note: it.note ?? "",
      source_member_invoice_id: it.source_member_invoice_id ?? "",
      receipt_path: "",
      receipt_name: "",
      item_id: it.id,
    };
  }

  const person = it.supplier_member_id
    ? roster.find((p) => p.id === it.supplier_member_id)
    : undefined;
  const match = person?.rates.find(
    (r) =>
      r.descriptor === (it.rate_descriptor ?? "") &&
      r.unit === it.rate_unit &&
      Number(r.amount) === amt
  );

  return {
    key: newKey(),
    kind: "person",
    supplier_member_id: it.supplier_member_id ?? "",
    rate_id: match?.id ?? "",
    rate_unit: it.rate_unit,
    rate_amount: amt,
    rate_descriptor: it.rate_descriptor ?? "",
    sessions: String(it.sessions ?? 0),
    hours: String(it.hours ?? 0),
    amount: "",
    direction: "subtract",
    task: it.task,
    note: it.note ?? "",
    source_member_invoice_id: it.source_member_invoice_id ?? "",
    receipt_path: "",
    receipt_name: "",
    item_id: it.id,
  };
}

export function SupplierInvoiceEditor({
  invoice,
  initialItems,
  roster,
  supplierName,
  submissionCount = 0,
}: {
  invoice: Invoice;
  initialItems: InvoiceLineItem[];
  roster: RosterPerson[];
  supplierName: string;
  submissionCount?: number;
}) {
  const router = useRouter();
  const currency = invoice.currency;

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [shipTo, setShipTo] = useState(invoice.ship_to_address ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0));
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems.map((it) => toRow(it, roster))
  );
  const [busy, setBusy] = useState<null | "save" | "submit" | "pull">(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const personById = useMemo(() => {
    const m = new Map<string, RosterPerson>();
    roster.forEach((p) => m.set(p.id, p));
    return m;
  }, [roster]);

  function rowTotal(r: Row): number {
    if (r.kind === "adjustment") {
      const mag = Math.abs(Number(r.amount) || 0);
      return r.direction === "subtract" ? -mag : mag;
    }
    if (r.kind === "expense") {
      // An expense claim always adds to the invoice.
      return Math.abs(Number(r.amount) || 0);
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
    () => computeInvoiceTotals(lineTotals, Number(taxRate) || 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineTotals), taxRate]
  );

  function patch(key: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function addPersonLine() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "person",
        supplier_member_id: "",
        rate_id: "",
        rate_unit: "per_session",
        rate_amount: 0,
        rate_descriptor: "",
        sessions: "",
        hours: "",
        amount: "",
        direction: "subtract",
        task: "teaching",
        note: "",
        source_member_invoice_id: "",
        receipt_path: "",
        receipt_name: "",
        item_id: "",
      },
    ]);
  }
  function addAdjustmentLine() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "adjustment",
        supplier_member_id: "",
        rate_id: "",
        rate_unit: "fixed",
        rate_amount: 0,
        rate_descriptor: "",
        sessions: "0",
        hours: "0",
        amount: "",
        direction: "subtract",
        task: ADJUSTMENT_TASK,
        note: "",
        source_member_invoice_id: "",
        receipt_path: "",
        receipt_name: "",
        item_id: "",
      },
    ]);
  }
  function addExpenseLine() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "expense",
        supplier_member_id: "",
        rate_id: "",
        rate_unit: "fixed",
        rate_amount: 0,
        rate_descriptor: "",
        sessions: "0",
        hours: "0",
        amount: "",
        direction: "add",
        task: "misc_expenses",
        note: "",
        source_member_invoice_id: "",
        receipt_path: "",
        receipt_name: "",
        item_id: "",
      },
    ]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function onReceiptFile(key: string, file: File | null) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setReceiptBusy(key);
    const fd = new FormData();
    fd.append("invoiceId", invoice.id);
    fd.append("file", file);
    const res = await uploadReceipt(fd);
    if (res.error) {
      setError(res.error);
    } else {
      // A freshly uploaded file has no persisted line-item id yet, so clear the
      // View link until the draft is saved.
      patch(key, { receipt_path: res.path ?? "", receipt_name: res.name ?? "Receipt", item_id: "" });
    }
    setReceiptBusy(null);
  }

  function changePerson(key: string, personId: string) {
    patch(key, { supplier_member_id: personId, rate_id: "", rate_unit: "per_session", rate_amount: 0, rate_descriptor: "" });
  }
  function changeRate(key: string, rateId: string, personId: string) {
    const person = personById.get(personId);
    const rate = person?.rates.find((x) => x.id === rateId);
    if (!rate) {
      patch(key, { rate_id: "", rate_amount: 0, rate_descriptor: "" });
      return;
    }
    patch(key, {
      rate_id: rate.id,
      rate_unit: rate.unit,
      rate_amount: Number(rate.amount),
      rate_descriptor: rate.descriptor,
      task: (rate.task ?? undefined) ?? ("teaching" as TaskType),
    });
  }

  function buildItems(): SaveSupplierItem[] {
    return rows.map((r, i) => {
      if (r.kind === "expense") {
        const magnitude = Math.abs(Number(r.amount) || 0);
        const description = r.note.trim();
        return {
          centre: "MathVision",
          task: "misc_expenses",
          note: description || null,
          sessions: 0,
          hours: 0,
          rate_id: null,
          rate_descriptor: description || "Expense claim",
          rate_unit: "fixed",
          rate_amount: magnitude,
          sort_order: i,
          supplier_member_id: null,
          source_member_invoice_id: null,
          receipt_path: r.receipt_path || null,
        };
      }
      if (r.kind === "adjustment") {
        const mag = Math.abs(Number(r.amount) || 0);
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
          // "For whom": a specific roster person, or null for a general adjustment.
          supplier_member_id: r.supplier_member_id || null,
          source_member_invoice_id: r.source_member_invoice_id || null,
        };
      }
      return {
        centre: "MathVision",
        task: r.task,
        note: r.note.trim() || null,
        sessions: Number(r.sessions) || 0,
        hours: Number(r.hours) || 0,
        rate_id: r.rate_id || null,
        rate_descriptor: r.rate_descriptor || null,
        rate_unit: r.rate_unit,
        rate_amount: r.rate_amount || 0,
        sort_order: i,
        supplier_member_id: r.supplier_member_id || null,
        source_member_invoice_id: r.source_member_invoice_id || null,
      };
    });
  }

  async function doSave(): Promise<boolean> {
    setError(null);
    setNotice(null);
    // person lines must have a person + rate
    const bad = rows.find((r) => r.kind === "person" && (!r.supplier_member_id || !r.rate_id));
    if (bad) {
      setError("Every person line needs a person and a rate selected.");
      return false;
    }
    // adjustments must have a description and a non-zero amount
    const badAdj = rows.find(
      (r) => r.kind === "adjustment" && (!r.note.trim() || !(Number(r.amount) > 0))
    );
    if (badAdj) {
      setError("Every adjustment needs a description and an amount greater than zero.");
      return false;
    }
    // expense claims must have a description and a positive amount (the receipt
    // is enforced at submit so a draft can be saved while it's being gathered).
    const badExp = rows.find(
      (r) => r.kind === "expense" && (!r.note.trim() || !(Number(r.amount) > 0))
    );
    if (badExp) {
      setError("Every expense claim needs a description and an amount greater than zero.");
      return false;
    }
    const cleanTax = Math.min(100, Math.max(0, Math.round((Number(taxRate) || 0) * 1000) / 1000));
    const res = await saveSupplierInvoice({
      invoiceId: invoice.id,
      displayName: displayName.trim() || supplierName,
      shipTo: shipTo.trim() || null,
      notes: notes.trim() || null,
      taxRate: cleanTax,
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
  async function onPull() {
    setBusy("pull");
    // Save current edits first so pulling doesn't discard them, then import.
    if (await doSave()) {
      const res = await pullMemberInvoices(invoice.id);
      if (res.error) setError(res.error);
      else {
        setNotice(
          `Pulled in ${res.count ?? 0} member submission${res.count === 1 ? "" : "s"}.`
        );
        router.refresh();
      }
    }
    setBusy(null);
  }
  async function onSubmit() {
    if (rows.length === 0 && submissionCount === 0) {
      setError("Add at least one line item before submitting.");
      return;
    }
    // Hard gate: no expense claim can be submitted without a receipt.
    const noReceipt = rows.find((r) => r.kind === "expense" && !r.receipt_path);
    if (noReceipt) {
      setError("Attach a receipt to every expense claim before submitting.");
      return;
    }
    // Fixed-salary teacher lines still need sessions + hours for the
    // teaching-tracker check. Non-teacher fixed roles (managers, phone
    // ambassadors) are exempt.
    const badFixed = rows.find(
      (r) =>
        r.kind === "person" &&
        r.rate_unit === "fixed" &&
        personById.get(r.supplier_member_id)?.role === "teacher" &&
        (!(Number(r.sessions) > 0) || !(Number(r.hours) > 0))
    );
    if (badFixed) {
      setError(
        "Fixed-salary teachers need both sessions and hours (for the teaching-tracker cross-check)."
      );
      return;
    }
    setBusy("submit");
    if (await doSave()) {
      // Always pull in any outstanding member submissions before submitting so
      // their pay is never left off the invoice (submitting locks them).
      if (submissionCount > 0) {
        const pull = await pullMemberInvoices(invoice.id);
        if (pull.error) {
          setError(pull.error);
          setBusy(null);
          return;
        }
      }
      const res = await submitInvoiceById(invoice.id);
      if (res.error) setError(res.error);
      else {
        setNotice("Invoice submitted to HR.");
        router.refresh();
      }
    }
    setBusy(null);
  }

  const noRoster = roster.length === 0;

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {noRoster && (
        <Alert tone="warning" title="No people configured">
          Your HR team hasn&apos;t added any people to your roster yet. You can still
          add adjustment lines below.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={<span className="font-mono text-base tnum">{invoice.invoice_number}</span>}
          description="Add a line per person, expense claims (with a receipt), and any adjustments."
          action={<StatusPill status={invoice.status} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name shown on invoice" hint="Defaults to the business name.">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="From address">
            <Textarea
              value={shipTo}
              onChange={(e) => setShipTo(e.target.value)}
              placeholder="Address to appear on the invoice"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Line items"
          action={
            <div className="flex flex-wrap gap-2">
              {submissionCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="neutral"
                  loading={busy === "pull"}
                  onClick={onPull}
                >
                  Pull in {submissionCount} submission{submissionCount === 1 ? "" : "s"}
                </Button>
              )}
              <Button type="button" size="sm" variant="brand-soft" onClick={addPersonLine}>
                + Person line
              </Button>
              <Button type="button" size="sm" variant="neutral" onClick={addExpenseLine}>
                + Expense claim
              </Button>
              <Button type="button" size="sm" variant="neutral" onClick={addAdjustmentLine}>
                + Adjustment
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center text-sm text-ink-500">
              No lines yet. Add a <strong>person line</strong> or an{" "}
              <strong>adjustment</strong>.
            </p>
          )}

          {rows.map((row, i) => {
            const total = lineTotals[i];
            const person = personById.get(row.supplier_member_id);
            return (
              <div key={row.key} className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {row.kind === "person"
                      ? `Person line ${i + 1}`
                      : row.kind === "expense"
                        ? `Expense claim ${i + 1}`
                        : `Adjustment ${i + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>

                {row.kind === "person" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Person">
                        <Select
                          value={row.supplier_member_id}
                          onChange={(e) => changePerson(row.key, e.target.value)}
                        >
                          <option value="">— Select person —</option>
                          {roster.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label="Rate"
                        hint={
                          row.rate_id
                            ? `${formatCurrency(row.rate_amount, currency)} ${RATE_UNIT_LABELS[row.rate_unit]}`
                            : "Pick the person first, then a rate."
                        }
                      >
                        <Select
                          value={row.rate_id}
                          disabled={!person}
                          onChange={(e) => changeRate(row.key, e.target.value, row.supplier_member_id)}
                        >
                          <option value="">— Select rate —</option>
                          {(person?.rates ?? []).map((r) => (
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
                      {(row.rate_unit !== "fixed" || person?.role === "teacher") && (
                        <>
                          <div>
                            <Label>
                              Sessions
                              {row.rate_unit === "fixed" && (
                                <span className="text-red-500"> *</span>
                              )}
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={row.sessions}
                              onChange={(e) => patch(row.key, { sessions: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>
                              Hours
                              {row.rate_unit === "fixed" && (
                                <span className="text-red-500"> *</span>
                              )}
                            </Label>
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
                  </>
                ) : row.kind === "expense" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Description" required>
                        <Input
                          value={row.note}
                          onChange={(e) => patch(row.key, { note: e.target.value })}
                          placeholder="e.g. Printing for March mock papers"
                        />
                      </Field>
                      <Field
                        label={`Amount (${currency})`}
                        hint="What was spent — a positive number."
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => patch(row.key, { amount: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>
                          Receipt <span className="text-red-500">*</span>
                        </Label>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
                            {receiptBusy === row.key
                              ? "Uploading…"
                              : row.receipt_path
                                ? "Replace receipt"
                                : "Upload receipt"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,application/pdf"
                              className="hidden"
                              disabled={receiptBusy === row.key}
                              onChange={(e) =>
                                onReceiptFile(row.key, e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {row.receipt_path ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-teal-700">
                              <span aria-hidden>✓</span>
                              <span className="max-w-[12rem] truncate">
                                {row.receipt_name || "Attached"}
                              </span>
                              {row.item_id && (
                                <a
                                  href={`/receipts/${row.item_id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-600 underline"
                                >
                                  View
                                </a>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">
                              PDF or image, up to 10 MB. Required to submit.
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label>Line total</Label>
                        <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                          {formatCurrency(total, currency)}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Description" required>
                        <Input
                          value={row.note}
                          onChange={(e) => patch(row.key, { note: e.target.value })}
                          placeholder="Unpaid day off"
                        />
                      </Field>
                      <Field
                        label="For whom"
                        hint="A specific person, or general to the whole invoice."
                      >
                        <Select
                          value={row.supplier_member_id}
                          onChange={(e) =>
                            patch(row.key, { supplier_member_id: e.target.value })
                          }
                        >
                          <option value="">General (whole invoice)</option>
                          {roster.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                          value={row.amount}
                          onChange={(e) => patch(row.key, { amount: e.target.value })}
                        />
                      </Field>
                      <div>
                        <Label>Line total</Label>
                        <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                          {formatCurrency(total, currency)}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {row.kind === "person" && (
                  <div className="mt-3">
                    <Field label="Note">
                      <Input
                        value={row.note}
                        onChange={(e) => patch(row.key, { note: e.target.value })}
                        placeholder="Optional description"
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything HR should know about this invoice"
              />
            </Field>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Subtotal</span>
                <span className="tnum font-medium">{formatCurrency(totals.subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tax_rate" className="text-ink-500">
                  Tax rate (%)
                </label>
                <Input
                  id="tax_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  className="w-24 text-right"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Tax ({totals.taxRate}%)</span>
                <span className="tnum font-medium">{formatCurrency(totals.taxAmount, currency)}</span>
              </div>
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
          Save &amp; submit
        </Button>
        <Button href={`/print/invoice/${invoice.id}`} variant="ghost">
          Download / Print
        </Button>
        <span className="ml-auto text-xs text-ink-400">
          Editing is possible until HR locks the invoice.
        </span>
      </div>
    </div>
  );
}
