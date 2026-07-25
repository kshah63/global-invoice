"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCY_META,
  PAY_TYPES,
  PAY_TYPE_LABELS,
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
import { Alert } from "@/components/ui/Feedback";

export interface RosterPersonState {
  id: string | null;
  name: string;
  code: string;
  pay_type: PayType;
  monthly_salary: number | null;
  rate_unit: RateUnit;
  rate_amount: number;
  rate_descriptor: string | null;
  rate_task: TaskType | null;
}

interface PersonRow extends RosterPersonState {
  key: string;
}

let seq = 0;
const key = () => `k-${seq++}-${Math.round(Math.random() * 1e6)}`;

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
        pay_type: "fixed",
        monthly_salary: 0,
        rate_unit: "per_hour",
        rate_amount: 0,
        rate_descriptor: "",
        rate_task: null,
      },
    ]);
  }
  function removePerson(k: string) {
    setPeople((prev) => prev.filter((r) => r.key !== k));
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    const payload: RosterPersonInput[] = people.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      code: p.code.trim(),
      pay_type: p.pay_type,
      monthly_salary: p.pay_type === "fixed" ? Number(p.monthly_salary) || 0 : null,
      rate_unit: p.rate_unit,
      rate_amount: p.pay_type === "rate" ? Number(p.rate_amount) || 0 : 0,
      rate_descriptor: p.pay_type === "rate" ? p.rate_descriptor?.trim() || null : null,
      rate_task: p.pay_type === "rate" ? p.rate_task : null,
    }));
    const res = await saveRoster(supplierId, payload);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotice("Roster saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="People (roster)"
        description="Each person is either a fixed monthly salary or a session/hour rate. HR sets the figure; they confirm it and add adjustments."
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

            <div className="mt-3">
              <Field label="Pay type">
                <Select
                  value={p.pay_type}
                  onChange={(e) => patch(p.key, { pay_type: e.target.value as PayType })}
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
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label>Descriptor</Label>
                  <Input
                    value={p.rate_descriptor ?? ""}
                    onChange={(e) => patch(p.key, { rate_descriptor: e.target.value })}
                    placeholder="Weekday teaching"
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select
                    value={p.rate_unit}
                    onChange={(e) => patch(p.key, { rate_unit: e.target.value as RateUnit })}
                  >
                    <option value="per_session">per session</option>
                    <option value="per_hour">per hour</option>
                  </Select>
                </div>
                <div>
                  <Label>Amount ({sym})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.rate_amount}
                    onChange={(e) => patch(p.key, { rate_amount: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Task</Label>
                  <Select
                    value={p.rate_task ?? ""}
                    onChange={(e) =>
                      patch(p.key, { rate_task: (e.target.value || null) as TaskType | null })
                    }
                  >
                    <option value="">Teaching (default)</option>
                    {SUPPLIER_TASKS.map((t) => (
                      <option key={t} value={t}>
                        {TASK_LABELS[t]}
                      </option>
                    ))}
                  </Select>
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
