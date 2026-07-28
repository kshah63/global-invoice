"use client";

import { useState } from "react";
import {
  CENTRES,
  MONTH_NAMES,
  TASKS,
  TASK_LABELS,
  type Centre,
  type TaskType,
} from "@/lib/constants";
import { saveChecks, type CheckItemInput } from "@/actions/dept-checks";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

interface ItemRow extends CheckItemInput {
  key: string;
}

interface IndividualBlock {
  key: string;
  teamMemberId: string;
  notes: string;
  items: ItemRow[];
}

let seq = 0;
const key = () => `c-${seq++}-${Math.round(Math.random() * 1e6)}`;

const blankRow = (sort_order: number): ItemRow => ({
  key: key(),
  task: "teaching",
  note: null,
  sessions: 0,
  hours: 0,
  sort_order,
});

export function MultiCheckEditor({
  teamMembers,
  defaultBusiness,
}: {
  teamMembers: { id: string; name: string; employee_id: string | null }[];
  defaultBusiness: Centre;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [business, setBusiness] = useState<Centre>(defaultBusiness);

  // Default a fresh block to the first individual not already picked, so the
  // head can add several people without re-picking each dropdown.
  function nextMemberId(blocks: IndividualBlock[]): string {
    const used = new Set(blocks.map((b) => b.teamMemberId));
    const free = teamMembers.find((t) => !used.has(t.id));
    return free?.id ?? teamMembers[0]?.id ?? "";
  }

  const [individuals, setIndividuals] = useState<IndividualBlock[]>(() => [
    {
      key: key(),
      teamMemberId: teamMembers[0]?.id ?? "",
      notes: "",
      items: [blankRow(0)],
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) years.push(y);

  function patchBlock(bk: string, p: Partial<IndividualBlock>) {
    setIndividuals((prev) => prev.map((b) => (b.key === bk ? { ...b, ...p } : b)));
  }
  function addIndividual() {
    setIndividuals((prev) => [
      ...prev,
      { key: key(), teamMemberId: nextMemberId(prev), notes: "", items: [blankRow(0)] },
    ]);
  }
  function removeIndividual(bk: string) {
    setIndividuals((prev) => prev.filter((b) => b.key !== bk));
  }
  function patchRow(bk: string, rk: string, p: Partial<ItemRow>) {
    setIndividuals((prev) =>
      prev.map((b) =>
        b.key === bk
          ? { ...b, items: b.items.map((r) => (r.key === rk ? { ...r, ...p } : r)) }
          : b
      )
    );
  }
  function addRow(bk: string) {
    setIndividuals((prev) =>
      prev.map((b) =>
        b.key === bk ? { ...b, items: [...b.items, blankRow(b.items.length)] } : b
      )
    );
  }
  function removeRow(bk: string, rk: string) {
    setIndividuals((prev) =>
      prev.map((b) =>
        b.key === bk ? { ...b, items: b.items.filter((r) => r.key !== rk) } : b
      )
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (individuals.length === 0) {
      setError("Add at least one individual.");
      return;
    }
    const picked = individuals.filter((b) => b.teamMemberId);
    if (picked.length === 0) {
      setError("Select an individual for each entry.");
      return;
    }
    const ids = picked.map((b) => b.teamMemberId);
    if (new Set(ids).size !== ids.length) {
      setError("The same individual is selected more than once — combine their lines.");
      return;
    }
    setSaving(true);
    const res = await saveChecks({
      year,
      month,
      business,
      individuals: picked.map((b) => ({
        teamMemberId: b.teamMemberId,
        notes: b.notes.trim() || null,
        items: b.items.map((r, i) => ({
          task: r.task,
          note: r.note?.toString().trim() || null,
          sessions: Number(r.sessions) || 0,
          hours: Number(r.hours) || 0,
          sort_order: i,
        })),
      })),
    });
    if (res?.error) {
      setError(res.error);
      setSaving(false);
    }
  }

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Shared period — set once for everyone in this submission. */}
      <Card>
        <CardHeader
          title="Period"
          description="Applies to every individual in this cross-check."
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Month" required>
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year" required>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Business" required>
            <Select value={business} onChange={(e) => setBusiness(e.target.value as Centre)}>
              {CENTRES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {/* One block per individual. */}
      {individuals.map((block, bi) => (
        <Card key={block.key}>
          <CardHeader
            title={`Individual ${bi + 1}`}
            description={`Sessions and hours for ${periodLabel}.`}
            action={
              individuals.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeIndividual(block.key)}
                >
                  Remove
                </Button>
              ) : undefined
            }
          />
          <CardBody className="space-y-3">
            <Field label="Individual" required>
              <Select
                value={block.teamMemberId}
                onChange={(e) => patchBlock(block.key, { teamMemberId: e.target.value })}
              >
                {teamMembers.length === 0 && <option value="">No team members</option>}
                {teamMembers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.employee_id})
                  </option>
                ))}
              </Select>
            </Field>

            {block.items.map((row) => (
              <div
                key={row.key}
                className="grid gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-3">
                  <Label>Task</Label>
                  <Select
                    value={row.task}
                    onChange={(e) =>
                      patchRow(block.key, row.key, { task: e.target.value as TaskType })
                    }
                  >
                    {TASKS.filter((t) => t !== "fixed_salary").map((t) => (
                      <option key={t} value={t}>
                        {TASK_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Sessions</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={row.sessions}
                    onChange={(e) =>
                      patchRow(block.key, row.key, { sessions: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={row.hours}
                    onChange={(e) =>
                      patchRow(block.key, row.key, { hours: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="sm:col-span-4">
                  <Label>Note</Label>
                  <Input
                    value={row.note ?? ""}
                    onChange={(e) => patchRow(block.key, row.key, { note: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeRow(block.key, row.key)}
                    className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                    disabled={block.items.length === 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                size="sm"
                variant="brand-soft"
                onClick={() => addRow(block.key)}
              >
                + Add line
              </Button>
            </div>

            <Field label="Notes for this individual (optional)">
              <Textarea
                value={block.notes}
                onChange={(e) => patchBlock(block.key, { notes: e.target.value })}
              />
            </Field>
          </CardBody>
        </Card>
      ))}

      <div>
        <Button type="button" variant="neutral" onClick={addIndividual}>
          + Add individual
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Submit cross-check
        </Button>
        <Button href="/dept/checks" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
