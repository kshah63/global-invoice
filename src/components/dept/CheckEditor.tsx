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
import { saveCheck, type CheckItemInput } from "@/actions/dept-checks";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

interface ItemRow extends CheckItemInput {
  key: string;
}

let seq = 0;
const key = () => `c-${seq++}-${Math.round(Math.random() * 1e6)}`;

export function CheckEditor({
  teamMembers,
  defaultBusiness,
  initial,
}: {
  teamMembers: { id: string; name: string; employee_id: string }[];
  defaultBusiness: Centre;
  initial?: {
    id: string;
    teamMemberId: string;
    year: number;
    month: number;
    business: Centre;
    notes: string;
    items: CheckItemInput[];
  };
}) {
  const now = new Date();
  const [teamMemberId, setTeamMemberId] = useState(
    initial?.teamMemberId ?? teamMembers[0]?.id ?? ""
  );
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth() + 1);
  const [business, setBusiness] = useState<Centre>(
    initial?.business ?? defaultBusiness
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    (initial?.items ?? [{ task: "teaching", note: null, sessions: 0, hours: 0, sort_order: 0 }]).map(
      (i) => ({ ...i, key: key() })
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) years.push(y);

  function patch(k: string, p: Partial<ItemRow>) {
    setItems((prev) => prev.map((r) => (r.key === k ? { ...r, ...p } : r)));
  }
  function addRow() {
    setItems((prev) => [
      ...prev,
      { key: key(), task: "teaching", note: null, sessions: 0, hours: 0, sort_order: prev.length },
    ]);
  }
  function removeRow(k: string) {
    setItems((prev) => prev.filter((r) => r.key !== k));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teamMemberId) {
      setError("Select a team member.");
      return;
    }
    setSaving(true);
    const res = await saveCheck({
      checkId: initial?.id ?? null,
      teamMemberId,
      year,
      month,
      business,
      notes: notes.trim() || null,
      items: items.map((r, i) => ({
        task: r.task,
        note: r.note?.toString().trim() || null,
        sessions: Number(r.sessions) || 0,
        hours: Number(r.hours) || 0,
        sort_order: i,
      })),
    });
    if (res?.error) {
      setError(res.error);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Team member" required>
            <Select
              value={teamMemberId}
              onChange={(e) => setTeamMemberId(e.target.value)}
            >
              {teamMembers.length === 0 && <option value="">No team members</option>}
              {teamMembers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.employee_id})
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
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sessions & hours"
          description="Record what this teacher actually did, so HR can cross-check their invoice."
          action={
            <Button type="button" size="sm" variant="brand-soft" onClick={addRow}>
              + Add line
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {items.map((row, i) => (
            <div
              key={row.key}
              className="grid gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-3">
                <Label>Task</Label>
                <Select
                  value={row.task}
                  onChange={(e) => patch(row.key, { task: e.target.value as TaskType })}
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
                  onChange={(e) => patch(row.key, { sessions: Number(e.target.value) })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={row.hours}
                  onChange={(e) => patch(row.key, { hours: Number(e.target.value) })}
                />
              </div>
              <div className="sm:col-span-4">
                <Label>Note</Label>
                <Input
                  value={row.note ?? ""}
                  onChange={(e) => patch(row.key, { note: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <Field label="Overall notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          {initial ? "Save changes" : "Submit cross-check"}
        </Button>
        <Button href="/dept/checks" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
