"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCY_META,
  PAY_TYPES,
  PAY_TYPE_LABELS,
  ROSTER_ROLES,
  ROSTER_ROLE_LABELS,
  SUBJECT_OPTIONS,
  SUPPLIER_TASKS,
  TASK_LABELS,
  type Currency,
  type PayType,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { saveRoster, type RosterPersonInput } from "@/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Alert } from "@/components/ui/Feedback";

// Tasks a work rate can be for (expense claims aren't a per-session/hour rate).
const RATE_TASKS = SUPPLIER_TASKS.filter((t) => t !== "misc_expenses");

export interface RosterRateState {
  id: string | null;
  descriptor: string | null;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
}

export interface RosterPersonState {
  id: string | null;
  name: string;
  code: string;
  role: string;
  pay_type: PayType;
  monthly_salary: number | null;
  subjects: string[];
  rates: RosterRateState[];
}

interface PersonRow extends RosterPersonState {
  key: string;
}

let seq = 0;
const key = () => `k-${seq++}-${Math.round(Math.random() * 1e6)}`;

function emptyRate(): RosterRateState {
  return { id: null, descriptor: "", unit: "per_hour", amount: 0, task: null };
}

export function RosterEditor({
  supplierId,
  currency,
  initialPeople,
}: {
  supplierId: string;
  currency: Currency; // the supplier's rate/invoice currency
  initialPeople: RosterPersonState[];
}) {
  const router = useRouter();
  const [people, setPeople] = useState<PersonRow[]>(
    initialPeople.map((p) => ({ ...p, key: key() }))
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sym = CURRENCY_META[currency].symbol;

  function patch(k: string, p: Partial<PersonRow>) {
    setPeople((prev) => prev.map((r) => (r.key === k ? { ...r, ...p } : r)));
  }
  function addPerson() {
    setPeople((prev) => [
      ...prev,
      {
        key: key(),
        id: null,
        name: "",
        code: "",
        role: "",
        pay_type: "fixed",
        monthly_salary: 0,
        subjects: [],
        rates: [],
      },
    ]);
  }
  function removePerson(k: string) {
    setPeople((prev) => prev.filter((r) => r.key !== k));
  }
  function changePayType(k: string, pay_type: PayType) {
    setPeople((prev) =>
      prev.map((r) => {
        if (r.key !== k) return r;
        // Switching to a rate: make sure there's at least one rate row to fill.
        const rates = pay_type === "rate" && r.rates.length === 0 ? [emptyRate()] : r.rates;
        return { ...r, pay_type, rates };
      })
    );
  }
  function patchRate(k: string, idx: number, p: Partial<RosterRateState>) {
    setPeople((prev) =>
      prev.map((r) =>
        r.key === k
          ? { ...r, rates: r.rates.map((rt, i) => (i === idx ? { ...rt, ...p } : rt)) }
          : r
      )
    );
  }
  function addRate(k: string) {
    setPeople((prev) =>
      prev.map((r) => (r.key === k ? { ...r, rates: [...r.rates, emptyRate()] } : r))
    );
  }
  function removeRate(k: string, idx: number) {
    setPeople((prev) =>
      prev.map((r) =>
        r.key === k ? { ...r, rates: r.rates.filter((_, i) => i !== idx) } : r
      )
    );
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    const payload: RosterPersonInput[] = people.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      code: p.code.trim(),
      role: p.role || null,
      pay_type: p.pay_type,
      monthly_salary: p.pay_type === "fixed" ? Number(p.monthly_salary) || 0 : null,
      subjects: p.subjects,
      rates:
        p.pay_type === "rate"
          ? p.rates.map((r) => ({
              id: r.id,
              descriptor: r.descriptor,
              unit: r.unit,
              amount: Number(r.amount) || 0,
              task: r.task,
            }))
          : [],
    }));
    const res = await saveRoster(supplierId, payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Absorb the saved ids (matched by code) so a subsequent save updates these
    // rows in place instead of treating them as new.
    if (res.saved) {
      const idByCode = new Map(res.saved.map((s) => [s.code, s.id]));
      setPeople((prev) =>
        prev.map((p) => {
          const id = idByCode.get(p.code.trim());
          return id ? { ...p, id } : p;
        })
      );
    }
    setNotice("Roster saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="People (roster)"
        description="Each person is a fixed monthly salary or one or more session/hour rates. HR sets the figures; they confirm and add adjustments."
        action={
          <Button type="button" size="sm" variant="brand-soft" onClick={addPerson}>
            + Add person
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {people.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center text-sm text-ink-500">
            No people yet. Click <strong>Add person</strong> to build the roster.
          </p>
        )}

        {people.map((p, pi) => (
          <div key={p.key} className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Person {pi + 1}
              </span>
              <button
                type="button"
                onClick={() => removePerson(p.key)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Remove person
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={p.name} onChange={(e) => patch(p.key, { name: e.target.value })} />
              </Field>
              <Field label="4-digit ID" required>
                <Input
                  value={p.code}
                  onChange={(e) => patch(p.key, { code: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="3001"
                />
              </Field>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Role">
                <Select
                  value={p.role}
                  onChange={(e) => patch(p.key, { role: e.target.value })}
                >
                  <option value="">— Select role —</option>
                  {ROSTER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROSTER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subjects they teach" hint="Select all that apply.">
                <MultiSelect
                  options={[...SUBJECT_OPTIONS]}
                  value={p.subjects}
                  onChange={(v) => patch(p.key, { subjects: v })}
                  placeholder="Select subjects"
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Pay type">
                <Select
                  value={p.pay_type}
                  onChange={(e) => changePayType(p.key, e.target.value as PayType)}
                >
                  {PAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PAY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {p.pay_type === "fixed" ? (
              <div className="mt-3">
                <Field label={`Monthly salary (${sym})`} required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.monthly_salary ?? 0}
                    onChange={(e) => patch(p.key, { monthly_salary: Number(e.target.value) })}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label>Rates</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="neutral"
                    onClick={() => addRate(p.key)}
                  >
                    + Add rate
                  </Button>
                </div>
                <div className="space-y-2">
                  {p.rates.map((rt, ri) => (
                    <div
                      key={ri}
                      className="grid items-end gap-3 rounded-lg border border-ink-200 bg-white p-3 sm:grid-cols-12"
                    >
                      <div className="sm:col-span-4">
                        <Label>Descriptor</Label>
                        <Input
                          value={rt.descriptor ?? ""}
                          onChange={(e) => patchRate(p.key, ri, { descriptor: e.target.value })}
                          placeholder="Weekday teaching"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Task</Label>
                        <Select
                          value={rt.task ?? ""}
                          onChange={(e) =>
                            patchRate(p.key, ri, {
                              task: (e.target.value || null) as TaskType | null,
                            })
                          }
                        >
                          <option value="">Teaching (default)</option>
                          {RATE_TASKS.map((t) => (
                            <option key={t} value={t}>
                              {TASK_LABELS[t]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Unit</Label>
                        <Select
                          value={rt.unit}
                          onChange={(e) =>
                            patchRate(p.key, ri, { unit: e.target.value as RateUnit })
                          }
                        >
                          <option value="per_session">per session</option>
                          <option value="per_hour">per hour</option>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Amount ({sym})</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rt.amount}
                          onChange={(e) => patchRate(p.key, ri, { amount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeRate(p.key, ri)}
                          className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                          aria-label="Remove rate"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {p.rates.length === 0 && (
                    <p className="text-sm text-ink-500">
                      No rates yet. Click <strong>Add rate</strong> to add one.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        <div>
          <Button type="button" onClick={onSave} loading={saving}>
            Save roster
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
