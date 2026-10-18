"use client";

import { useState } from "react";
import {
  CENTRES,
  TIMESHEET_TASKS,
  TIMESHEET_TASK_LABELS,
  type Centre,
  type TimesheetTask,
} from "@/lib/constants";
import type { TimesheetInput } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export interface TimesheetFormInitial {
  date?: string;
  business?: Centre;
  task?: TimesheetTask;
  description?: string;
  sessions?: string;
  hours?: string;
  inchargeId?: string;
  memberId?: string;
}

/**
 * Add/edit form shared by the member, in-charge and HR surfaces.
 * - Pass `inchargers` to show the "in-charge to verify" picker (member flow).
 * - Pass `members` to show the "team member" picker (in-charge/HR adds a line).
 */
export function TimesheetForm({
  inchargers,
  members,
  initial,
  submitLabel = "Add to timesheet",
  onSubmit,
  onCancel,
}: {
  inchargers?: { id: string; name: string }[];
  members?: { id: string; name: string }[];
  initial?: TimesheetFormInitial;
  submitLabel?: string;
  onSubmit: (v: TimesheetInput) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial?.date ?? today);
  const [business, setBusiness] = useState<Centre>(initial?.business ?? "MathVision");
  const [task, setTask] = useState<TimesheetTask>(initial?.task ?? "teaching");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sessions, setSessions] = useState(initial?.sessions ?? "");
  const [hours, setHours] = useState(initial?.hours ?? "");
  const [inchargeId, setInchargeId] = useState(initial?.inchargeId ?? "");
  const [memberId, setMemberId] = useState(initial?.memberId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (members && !memberId) {
      setError("Choose a team member.");
      return;
    }
    if (inchargers && !inchargeId) {
      setError("Choose an in-charge to verify this.");
      return;
    }
    if (!(Number(sessions) > 0) && !(Number(hours) > 0)) {
      setError("Enter a number of sessions or hours.");
      return;
    }
    setBusy(true);
    const res = await onSubmit({
      date,
      business,
      task,
      description: description.trim() || null,
      sessions: Number(sessions) || 0,
      hours: Number(hours) || 0,
      inchargeId: inchargers ? inchargeId || null : null,
      memberId: members ? memberId || null : null,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (!initial) {
      setDescription("");
      setSessions("");
      setHours("");
    }
    onCancel?.();
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members && (
          <Field label="Team member" required>
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">— Select —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
        <Field label="Task" required>
          <Select value={task} onChange={(e) => setTask(e.target.value as TimesheetTask)}>
            {TIMESHEET_TASKS.map((t) => (
              <option key={t} value={t}>
                {TIMESHEET_TASK_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Description" hint="e.g. who you trained, or what you made.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you do?"
            />
          </Field>
        </div>
        <div>
          <Label>Sessions</Label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
          />
        </div>
        <div>
          <Label>Hours</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        {inchargers && (
          <Field label="In-charge to verify" required>
            <Select value={inchargeId} onChange={(e) => setInchargeId(e.target.value)}>
              <option value="">— Select —</option>
              {inchargers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={submit} loading={busy}>
          {submitLabel}
        </Button>
        {initial && onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
