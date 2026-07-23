"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCY_META,
  RATE_UNITS,
  RATE_UNIT_LABELS,
  SUPPLIER_TASKS,
  TASK_LABELS,
  type Currency,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import { saveRoster, type RosterPersonInput } from "@/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

interface RateRow {
  key: string;
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
}
interface PersonRow {
  key: string;
  id: string | null;
  name: string;
  code: string;
  rates: RateRow[];
}

let seq = 0;
const key = () => `k-${seq++}-${Math.round(Math.random() * 1e6)}`;

export function RosterEditor({
  supplierId,
  currency,
  initialPeople,
}: {
  supplierId: string;
  currency: Currency;
  initialPeople: { id: string; name: string; code: string; rates: Omit<RateRow, "key">[] }[];
}) {
  const router = useRouter();
  const [people, setPeople] = useState<PersonRow[]>(
    initialPeople.map((p) => ({
      key: key(),
      id: p.id,
      name: p.name,
      code: p.code,
      rates: p.rates.map((r) => ({ ...r, key: key() })),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sym = CURRENCY_META[currency].symbol;

  function patchPerson(k: string, patch: Partial<PersonRow>) {
    setPeople((prev) => prev.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  }
  function addPerson() {
    setPeople((prev) => [
      ...prev,
      { key: key(), id: null, name: "", code: "", rates: [] },
    ]);
  }
  function removePerson(k: string) {
    setPeople((prev) => prev.filter((p) => p.key !== k));
  }
  function addRate(pk: string) {
    setPeople((prev) =>
      prev.map((p) =>
        p.key === pk
          ? {
              ...p,
              rates: [
                ...p.rates,
                { key: key(), descriptor: "", unit: "per_session", amount: 0, task: null },
              ],
            }
          : p
      )
    );
  }
  function patchRate(pk: string, rk: string, patch: Partial<RateRow>) {
    setPeople((prev) =>
      prev.map((p) =>
        p.key === pk
          ? { ...p, rates: p.rates.map((r) => (r.key === rk ? { ...r, ...patch } : r)) }
          : p
      )
    );
  }
  function removeRate(pk: string, rk: string) {
    setPeople((prev) =>
      prev.map((p) =>
        p.key === pk ? { ...p, rates: p.rates.filter((r) => r.key !== rk) } : p
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
      rates: p.rates.map((r) => ({
        descriptor: r.descriptor,
        unit: r.unit,
        amount: Number(r.amount) || 0,
        task: r.task,
      })),
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
        description="HR hard-codes each person's rates. These appear in the supplier's invoice."
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
                <Input
                  value={p.name}
                  onChange={(e) => patchPerson(p.key, { name: e.target.value })}
                />
              </Field>
              <Field label="4-digit ID" required>
                <Input
                  value={p.code}
                  onChange={(e) => patchPerson(p.key, { code: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="3001"
                />
              </Field>
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <Label>Rates</Label>
                <Button type="button" size="sm" variant="neutral" onClick={() => addRate(p.key)}>
                  + Add rate
                </Button>
              </div>
              {p.rates.length === 0 && (
                <p className="text-xs text-ink-400">No rates yet.</p>
              )}
              <div className="space-y-2">
                {p.rates.map((r) => (
                  <div
                    key={r.key}
                    className="grid gap-2 rounded-lg border border-ink-200 bg-white p-2 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-2">
                      <Label>Task</Label>
                      <Select
                        value={r.task ?? ""}
                        onChange={(e) =>
                          patchRate(p.key, r.key, {
                            task: (e.target.value || null) as TaskType | null,
                          })
                        }
                      >
                        <option value="">Any</option>
                        {SUPPLIER_TASKS.map((t) => (
                          <option key={t} value={t}>
                            {TASK_LABELS[t]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-4">
                      <Label>Descriptor</Label>
                      <Input
                        value={r.descriptor}
                        onChange={(e) =>
                          patchRate(p.key, r.key, { descriptor: e.target.value })
                        }
                        placeholder="Weekday teaching"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Unit</Label>
                      <Select
                        value={r.unit}
                        onChange={(e) =>
                          patchRate(p.key, r.key, { unit: e.target.value as RateUnit })
                        }
                      >
                        {RATE_UNITS.filter((u) => u !== "fixed").map((u) => (
                          <option key={u} value={u}>
                            {RATE_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Amount ({sym})</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.amount}
                        onChange={(e) =>
                          patchRate(p.key, r.key, { amount: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="flex items-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeRate(p.key, r.key)}
                        className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
