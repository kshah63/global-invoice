"use client";

import { useState } from "react";
import {
  TASKS,
  TASK_LABELS,
  periodLabel,
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

export interface InitialIndividual {
  teamMemberId: string;
  notes: string;
  items: CheckItemInput[];
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
  year,
  month,
  business,
  initialIndividuals,
}: {
  teamMembers: { id: string; name: string; employee_id: string | null }[];
  year: number;
  month: number;
  // Fixed to the department head's own business — cross-checks always belong
  // to the centre they were set up for.
  business: Centre;
  // Individuals already submitted for this month, so the head can review, edit
  // or add to them rather than starting from scratch.
  initialIndividuals?: InitialIndividual[];
}) {
  function toBlock(ind: InitialIndividual): IndividualBlock {
    const items = ind.items.length
      ? ind.items.map((it) => ({ ...it, key: key() }))
      : [blankRow(0)];
    return { key: key(), teamMemberId: ind.teamMemberId, notes: ind.notes, items };
  }

  // Fresh blocks start unselected so the head consciously picks each person
  // from the dropdown rather than accidentally reporting on whoever is first.
  const emptyBlock = (): IndividualBlock => ({
    key: key(),
    teamMemberId: "",
    notes: "",
    items: [blankRow(0)],
  });

  const [individuals, setIndividuals] = useState<IndividualBlock[]>(() =>
    initialIndividuals && initialIndividuals.length
      ? initialIndividuals.map(toBlock)
      : [emptyBlock()]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patchBlock(bk: string, p: Partial<IndividualBlock>) {
    setIndividuals((prev) => prev.map((b) => (b.key === bk ? { ...b, ...p } : b)));
  }
  function addIndividual() {
    setIndividuals((prev) => [...prev, emptyBlock()]);
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
    // A block "has data" if it names a person or has any sessions/hours/note.
    const hasData = (b: IndividualBlock) =>
      b.teamMemberId ||
      b.notes.trim() ||
      b.items.some(
        (r) =>
          (Number(r.sessions) || 0) > 0 ||
          (Number(r.hours) || 0) > 0 ||
          (r.note && r.note.toString().trim())
      );
    // Catch a filled-in entry where no individual was chosen.
    if (individuals.some((b) => !b.teamMemberId && hasData(b))) {
      setError("Choose an individual for each entry (or clear it before submitting).");
      return;
    }
    const picked = individuals.filter((b) => b.teamMemberId);
    if (picked.length === 0) {
      setError("Select an individual to cross-check.");
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

  const period = periodLabel(year, month);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Both the month (from the period HR opened) and the business (the head's
          own centre) are fixed — shown here for context, not editable. */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-ink-900">
            Cross-check for {period}
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {business} · Add each individual below with the sessions and hours
            they worked.
          </p>
        </CardBody>
      </Card>

      {/* One block per individual. */}
      {individuals.map((block, bi) => (
        <Card key={block.key}>
          <CardHeader
            title={`Individual ${bi + 1}`}
            description={`Sessions and hours for ${period}.`}
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
                <option value="">
                  {teamMembers.length === 0
                    ? "No team members"
                    : "Select individual…"}
                </option>
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
                    className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    disabled={block.items.length === 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <div>
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
