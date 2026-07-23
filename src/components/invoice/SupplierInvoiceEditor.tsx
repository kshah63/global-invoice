"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SUPPLIER_TASKS,
  RATE_UNIT_LABELS,
  TASK_LABELS,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { computeInvoiceTotals, computeLineTotal } from "@/lib/invoice";
import { formatCurrency } from "@/lib/format";
import type { Invoice, InvoiceLineItem } from "@/lib/types";
import { saveSupplierInvoice, submitInvoiceById, type SaveSupplierItem } from "@/actions/invoices";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { StatusPill } from "@/components/ui/Badge";

export interface RosterPerson {
  id: string;
  name: string;
  rates: { id: string; descriptor: string; unit: RateUnit; amount: number; task: TaskType | null }[];
}

type Kind = "person" | "flat";
interface Row {
  key: string;
  kind: Kind;
  supplier_member_id: string;
  rate_id: string;
  rate_unit: RateUnit;
  rate_amount: number;
  rate_descriptor: string;
  sessions: string;
  hours: string;
  amount: string; // flat lines
  task: TaskType;
  note: string;
}

let seq = 0;
const newKey = () => `s-${seq++}-${Math.round(Math.random() * 1e6)}`;

function toRow(it: InvoiceLineItem): Row {
  const flat = it.rate_unit === "fixed";
  return {
    key: newKey(),
    kind: it.supplier_member_id && !flat ? "person" : flat && !it.supplier_member_id ? "flat" : it.supplier_member_id ? "person" : "flat",
    supplier_member_id: it.supplier_member_id ?? "",
    rate_id: "",
    rate_unit: it.rate_unit,
    rate_amount: Number(it.rate_amount ?? 0),
    rate_descriptor: it.rate_descriptor ?? "",
    sessions: String(it.sessions ?? 0),
    hours: String(it.hours ?? 0),
    amount: flat ? String(it.rate_amount ?? 0) : "",
    task: it.task,
    note: it.note ?? "",
  };
}

export function SupplierInvoiceEditor({
  invoice,
  initialItems,
  roster,
  supplierName,
}: {
  invoice: Invoice;
  initialItems: InvoiceLineItem[];
  roster: RosterPerson[];
  supplierName: string;
}) {
  const router = useRouter();
  const currency = invoice.currency;

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [shipTo, setShipTo] = useState(invoice.ship_to_address ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0));
  const [rows, setRows] = useState<Row[]>(initialItems.map(toRow));
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const personById = useMemo(() => {
    const m = new Map<string, RosterPerson>();
    roster.forEach((p) => m.set(p.id, p));
    return m;
  }, [roster]);

  function rowTotal(r: Row): number {
    if (r.kind === "flat") return Number(r.amount) || 0;
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
        task: "teaching",
        note: "",
      },
    ]);
  }
  function addFlatLine() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "flat",
        supplier_member_id: "",
        rate_id: "",
        rate_unit: "fixed",
        rate_amount: 0,
        rate_descriptor: "",
        sessions: "0",
        hours: "0",
        amount: "",
        task: "misc_expenses",
        note: "",
      },
    ]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
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
      if (r.kind === "flat") {
        return {
          centre: "MathVision",
          task: r.task,
          note: r.note.trim() || null,
          sessions: 0,
          hours: 0,
          rate_id: null,
          rate_descriptor: r.note.trim() || TASK_LABELS[r.task],
          rate_unit: "fixed",
          rate_amount: Number(r.amount) || 0,
          sort_order: i,
          supplier_member_id: null,
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
  async function onSubmit() {
    if (rows.length === 0) {
      setError("Add at least one line item before submitting.");
      return;
    }
    setBusy("submit");
    if (await doSave()) {
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
          add adjustment / misc lines below.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={<span className="font-mono text-base tnum">{invoice.invoice_number}</span>}
          description="Add a line per person, plus any adjustments or misc expenses."
          action={<StatusPill status={invoice.status} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name shown on invoice" hint="Defaults to the business name.">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Ship-to address">
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
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="brand-soft" onClick={addPersonLine}>
                + Person line
              </Button>
              <Button type="button" size="sm" variant="neutral" onClick={addFlatLine}>
                + Adjustment / misc
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center text-sm text-ink-500">
              No lines yet. Add a <strong>person line</strong> or an{" "}
              <strong>adjustment / misc</strong> line.
            </p>
          )}

          {rows.map((row, i) => {
            const total = lineTotals[i];
            const person = personById.get(row.supplier_member_id);
            return (
              <div key={row.key} className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {row.kind === "person" ? `Person line ${i + 1}` : `Adjustment ${i + 1}`}
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
                      <div>
                        <Label>Line total</Label>
                        <div className="flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium tnum">
                          {formatCurrency(total, currency)}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
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
                    <Field label={`Amount (${currency})`} hint="Can be negative for a deduction.">
                      <Input
                        type="number"
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
                )}

                <div className="mt-3">
                  <Field label="Note">
                    <Input
                      value={row.note}
                      onChange={(e) => patch(row.key, { note: e.target.value })}
                      placeholder="Optional description"
                    />
                  </Field>
                </div>
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
