"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CENTRES,
  RATE_UNIT_LABELS,
  TASKS,
  TASK_LABELS,
  isFixedSalaryTask,
  type Centre,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { computeInvoiceTotals, computeLineTotal } from "@/lib/invoice";
import { formatCurrency } from "@/lib/format";
import type { Invoice, InvoiceLineItem, TeamMemberRate } from "@/lib/types";
import { saveInvoice, submitInvoiceById, type SaveInvoiceItem } from "@/actions/invoices";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { StatusPill } from "@/components/ui/Badge";

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
  rate_amount: number;
}

let rowSeq = 0;
const newKey = () => `row-${rowSeq++}-${Math.round(Math.random() * 1e6)}`;

function toRow(it: InvoiceLineItem): Row {
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
    rate_amount: Number(it.rate_amount ?? 0),
  };
}

export function InvoiceEditor({
  invoice,
  initialItems,
  rates,
  teamMember,
}: {
  invoice: Invoice;
  initialItems: InvoiceLineItem[];
  rates: TeamMemberRate[];
  teamMember: { name: string; fixed_salary: number | null };
}) {
  const router = useRouter();
  const currency = invoice.currency;

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [shipTo, setShipTo] = useState(invoice.ship_to_address ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0));
  const [rows, setRows] = useState<Row[]>(
    initialItems.length ? initialItems.map(toRow) : []
  );

  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lineTotals = rows.map((r) =>
    computeLineTotal({
      rate_unit: r.rate_unit,
      rate_amount: r.rate_amount,
      sessions: Number(r.sessions) || 0,
      hours: Number(r.hours) || 0,
    })
  );
  const totals = useMemo(
    () => computeInvoiceTotals(lineTotals, Number(taxRate) || 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineTotals), taxRate]
  );

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function changeTask(key: string, task: TaskType) {
    if (isFixedSalaryTask(task)) {
      patchRow(key, {
        task,
        rate_unit: "fixed",
        rate_amount: teamMember.fixed_salary ?? 0,
        rate_descriptor: "Fixed salary",
        rate_id: "",
        sessions: "0",
        hours: "0",
      });
    } else {
      patchRow(key, (prevReset(task)));
    }
  }

  // When leaving fixed salary, clear the fixed rate.
  function prevReset(task: TaskType): Partial<Row> {
    return {
      task,
      rate_unit: "per_session",
      rate_amount: 0,
      rate_descriptor: "",
      rate_id: "",
    };
  }

  function changeRate(key: string, rateId: string) {
    const rate = rates.find((r) => r.id === rateId);
    if (!rate) {
      patchRow(key, { rate_id: "", rate_descriptor: "", rate_amount: 0 });
      return;
    }
    patchRow(key, {
      rate_id: rate.id,
      rate_descriptor: rate.descriptor,
      rate_unit: rate.unit,
      rate_amount: Number(rate.amount),
    });
  }

  function addRow() {
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
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function buildItems(): SaveInvoiceItem[] {
    return rows.map((r, i) => ({
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
    }));
  }

  async function doSave(): Promise<boolean> {
    setError(null);
    setNotice(null);
    const res = await saveInvoice({
      invoiceId: invoice.id,
      displayName: displayName.trim() || teamMember.name,
      shipTo: shipTo.trim() || null,
      notes: notes.trim() || null,
      taxRate: Number(taxRate) || 0,
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
    const ok = await doSave();
    if (ok) {
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
    const saved = await doSave();
    if (!saved) {
      setBusy(null);
      return;
    }
    const res = await submitInvoiceById(invoice.id);
    if (res.error) {
      setError(res.error);
    } else {
      setNotice("Invoice submitted to HR.");
      router.refresh();
    }
    setBusy(null);
  }

  const noRates = rates.length === 0 && teamMember.fixed_salary == null;

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {noRates && (
        <Alert tone="warning" title="No rates configured">
          Your HR team hasn&apos;t set up any rates or a fixed salary on your
          profile yet. Ask them to add these so your line totals can be
          calculated.
        </Alert>
      )}

      {/* Meta */}
      <Card>
        <CardHeader
          title={
            <span className="font-mono text-base tnum">{invoice.invoice_number}</span>
          }
          description="Fill in your sessions and hours for the month. Totals update as you type."
          action={<StatusPill status={invoice.status} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name shown on invoice"
            htmlFor="display_name"
            hint="Defaults from your profile — you can change it here."
          >
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Ship-to address" htmlFor="ship_to">
            <Textarea
              id="ship_to"
              value={shipTo}
              onChange={(e) => setShipTo(e.target.value)}
              placeholder="Address to appear on the invoice"
            />
          </Field>
        </CardBody>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader
          title="Line items"
          description="Centre × task × rate. Pick a rate from your configured rates; totals follow the rate's unit."
          action={
            <Button variant="brand-soft" size="sm" onClick={addRow} type="button">
              + Add line
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center text-sm text-ink-500">
              No line items yet. Click <strong>Add line</strong> to start.
            </p>
          )}

          {rows.map((row, i) => {
            const fixed = isFixedSalaryTask(row.task);
            const total = lineTotals[i];
            return (
              <div
                key={row.key}
                className="rounded-xl border border-ink-200 bg-ink-50/40 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Line {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Centre">
                    <Select
                      value={row.centre}
                      onChange={(e) =>
                        patchRow(row.key, { centre: e.target.value as Centre })
                      }
                    >
                      {CENTRES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Task">
                    <Select
                      value={row.task}
                      onChange={(e) =>
                        changeTask(row.key, e.target.value as TaskType)
                      }
                    >
                      {TASKS.map((t) => (
                        <option key={t} value={t}>
                          {TASK_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="mt-3">
                  <Field
                    label="Rate"
                    hint={
                      fixed
                        ? "Fixed salary — pulled from your profile."
                        : row.rate_id
                          ? `${formatCurrency(row.rate_amount, currency)} ${RATE_UNIT_LABELS[row.rate_unit]}`
                          : "Select one of your configured rates."
                    }
                  >
                    {fixed ? (
                      <Input
                        value={`${formatCurrency(row.rate_amount, currency)} (fixed salary)`}
                        disabled
                      />
                    ) : (
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
                    )}
                  </Field>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Sessions</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      value={fixed ? "" : row.sessions}
                      disabled={fixed}
                      onChange={(e) =>
                        patchRow(row.key, { sessions: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Time (hours)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      inputMode="decimal"
                      value={fixed ? "" : row.hours}
                      disabled={fixed}
                      onChange={(e) => patchRow(row.key, { hours: e.target.value })}
                    />
                  </div>
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
                      onChange={(e) => patchRow(row.key, { note: e.target.value })}
                      placeholder="Optional description"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* Totals */}
      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything HR should know about this invoice"
              />
            </Field>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Subtotal</span>
                <span className="tnum font-medium">
                  {formatCurrency(totals.subtotal, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tax_rate" className="text-ink-500">
                  Tax rate (%)
                </label>
                <Input
                  id="tax_rate"
                  type="number"
                  min="0"
                  step="0.1"
                  className="w-24 text-right"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">
                  Tax ({totals.taxRate}%)
                </span>
                <span className="tnum font-medium">
                  {formatCurrency(totals.taxAmount, currency)}
                </span>
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

      {/* Actions */}
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
