"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CENTRES,
  ADJUSTMENT_TASK,
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
import { TransferNote } from "@/components/TransferNote";

type Direction = "add" | "subtract";
interface Row {
  key: string;
  centre: Centre;
  task: TaskType;
  note: string; // adjustment rows: the (required) description
  sessions: string;
  hours: string;
  rate_id: string;
  rate_descriptor: string;
  rate_unit: RateUnit;
  rate_amount: number; // adjustment rows: positive magnitude (sign from `direction`)
  direction: Direction; // adjustment rows only
}

let rowSeq = 0;
const newKey = () => `row-${rowSeq++}-${Math.round(Math.random() * 1e6)}`;

function toRow(it: InvoiceLineItem): Row {
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
    () => computeInvoiceTotals(lineTotals, Number(taxRate) || 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineTotals), taxRate]
  );

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const memberHasFixed = teamMember.fixed_salary != null;
  function fixedUsedElsewhere(key: string) {
    return rows.some((r) => r.key !== key && isFixedSalaryTask(r.task));
  }

  function changeTask(key: string, task: TaskType) {
    if (isFixedSalaryTask(task)) {
      if (!memberHasFixed) {
        setError("This team member has no fixed salary configured.");
        return;
      }
      if (fixedUsedElsewhere(key)) {
        setError("An invoice can only have one fixed salary line.");
        return;
      }
      setError(null);
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
      patchRow(key, prevReset(task));
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
        direction: "subtract",
      },
    ]);
  }

  // An "other charge" is an ad-hoc line with its own description and amount, on
  // top of the configured rates (e.g. materials, reimbursement). It defaults to
  // a positive charge; a deduction is still available for corrections. Stored
  // as an adjustment line under the hood.
  function addOtherChargeRow() {
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
        direction: "add",
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function buildItems(): SaveInvoiceItem[] {
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
    // Adjustments need a description and a positive amount (the sign comes from
    // the addition/subtraction toggle).
    const badAdj = rows.find(
      (r) =>
        r.task === ADJUSTMENT_TASK && (!r.note.trim() || !(Number(r.rate_amount) > 0))
    );
    if (badAdj) {
      setError("Every other charge needs a description and an amount greater than zero.");
      return false;
    }
    // Clamp to [0, 100] and round to the DB's numeric(6,3) precision so the
    // preview total matches what the server stores.
    const cleanTax = Math.min(100, Math.max(0, Math.round((Number(taxRate) || 0) * 1000) / 1000));
    const res = await saveInvoice({
      invoiceId: invoice.id,
      displayName: displayName.trim() || teamMember.name,
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
          <Field label="From address" htmlFor="ship_to">
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
          description="Pick a rate from your configured rates; totals follow the rate's unit. Use “Other charge” for anything extra (with its own description)."
          action={
            <div className="flex gap-2">
              <Button variant="brand-soft" size="sm" onClick={addRow} type="button">
                + Add line
              </Button>
              <Button variant="neutral" size="sm" onClick={addOtherChargeRow} type="button">
                + Other charge
              </Button>
            </div>
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
            const isAdjustment = row.task === ADJUSTMENT_TASK;
            const total = lineTotals[i];
            return (
              <div
                key={row.key}
                className="rounded-xl border border-ink-200 bg-ink-50/40 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {isAdjustment ? `Other charge ${i + 1}` : `Line ${i + 1}`}
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
                        onChange={(e) => patchRow(row.key, { note: e.target.value })}
                        placeholder="e.g. Materials, reimbursement"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Type">
                        <Select
                          value={row.direction}
                          onChange={(e) =>
                            patchRow(row.key, { direction: e.target.value as Direction })
                          }
                        >
                          <option value="add">Charge (+)</option>
                          <option value="subtract">Deduction (−)</option>
                        </Select>
                      </Field>
                      <Field label={`Amount (${currency})`} hint="A positive number.">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={row.rate_amount ? String(row.rate_amount) : ""}
                          onChange={(e) =>
                            patchRow(row.key, { rate_amount: Number(e.target.value) })
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
                  <Field
                    label="Centre"
                    hint={fixed ? "N/A for fixed salary" : undefined}
                  >
                    <Select
                      value={row.centre}
                      disabled={fixed}
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
                      {TASKS.map((t) => {
                        // Only offer "Fixed Salary" when the member has one and it
                        // isn't already used on another line.
                        if (
                          t === "fixed_salary" &&
                          !(
                            memberHasFixed &&
                            (row.task === "fixed_salary" ||
                              !fixedUsedElsewhere(row.key))
                          )
                        ) {
                          return null;
                        }
                        return (
                          <option key={t} value={t}>
                            {TASK_LABELS[t]}
                          </option>
                        );
                      })}
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
                </>
                )}
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
                  max="100"
                  step="0.001"
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
              <TransferNote currency={currency} />
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
