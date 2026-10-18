"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { Select } from "@/components/ui/Field";
import { formatNumber } from "@/lib/format";
import {
  TIMESHEET_TASKS,
  TIMESHEET_TASK_LABELS,
  TIMESHEET_STATUSES,
  TIMESHEET_STATUS_META,
  type TimesheetStatus,
  type TimesheetTask,
} from "@/lib/constants";
import { TimesheetForm } from "@/components/timesheet/TimesheetForm";
import {
  TimesheetTable,
  ReturnControl,
  MiniButton,
  type TimesheetRowView,
} from "@/components/timesheet/TimesheetTable";
import {
  timesheetUpdate,
  timesheetVerify,
  timesheetReturn,
  timesheetDelete,
} from "@/actions/timesheet";
import type { TimesheetInput } from "@/lib/types";

export function TimesheetHrClient({
  rows,
  inchargers,
}: {
  rows: TimesheetRowView[];
  inchargers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TimesheetRowView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [member, setMember] = useState("all");
  const [month, setMonth] = useState("all");
  const [task, setTask] = useState<"all" | TimesheetTask>("all");
  const [status, setStatus] = useState<"all" | TimesheetStatus>("all");

  const memberNames = useMemo(
    () => [...new Set(rows.map((r) => r.memberName).filter(Boolean) as string[])].sort(),
    [rows]
  );
  const months = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (member === "all" || r.memberName === member) &&
          (month === "all" || r.date.slice(0, 7) === month) &&
          (task === "all" || r.task === task) &&
          (status === "all" || r.status === status)
      ),
    [rows, member, month, task, status]
  );

  const nonTeachingVerified = filtered
    .filter((r) => r.task !== "teaching" && r.status === "verified")
    .reduce((s, r) => s + Number(r.hours), 0);
  const nonTeachingPending = filtered
    .filter((r) => r.task !== "teaching" && r.status !== "verified")
    .reduce((s, r) => s + Number(r.hours), 0);
  const teachingSessions = filtered
    .filter((r) => r.task === "teaching")
    .reduce((s, r) => s + Number(r.sessions), 0);

  async function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else router.refresh();
  }
  async function editSubmit(v: TimesheetInput) {
    if (!editing) return { error: "No entry selected" };
    const r = await timesheetUpdate(editing.id, v);
    if (!r.error) {
      setEditing(null);
      router.refresh();
    }
    return r;
  }

  function actions(r: TimesheetRowView) {
    return (
      <>
        {r.status === "pending_review" && (
          <MiniButton tone="primary" onClick={() => run(() => timesheetVerify(r.id))}>
            Verify
          </MiniButton>
        )}
        {(r.status === "pending_review" || r.status === "pending_acceptance") && (
          <ReturnControl onReturn={async (note) => void (await run(() => timesheetReturn(r.id, note)))} />
        )}
        <MiniButton onClick={() => setEditing(r)}>Edit</MiniButton>
        <MiniButton tone="danger" onClick={() => run(() => timesheetDelete(r.id))}>
          Delete
        </MiniButton>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card px-4 py-3">
          <div className="text-2xl font-semibold tnum text-ink-900">{formatNumber(nonTeachingVerified)}</div>
          <div className="mt-1 text-xs text-ink-500">Non-teaching hours · verified</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-2xl font-semibold tnum text-ink-900">{formatNumber(nonTeachingPending)}</div>
          <div className="mt-1 text-xs text-ink-500">Non-teaching hours · pending</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-2xl font-semibold tnum text-ink-900">{formatNumber(teachingSessions)}</div>
          <div className="mt-1 text-xs text-ink-500">Teaching sessions (filtered)</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-2xl font-semibold tnum text-ink-900">{filtered.length}</div>
          <div className="mt-1 text-xs text-ink-500">Entries (filtered)</div>
        </div>
      </div>

      {editing && (
        <Card>
          <CardHeader title="Edit entry" description="HR can edit any entry, including verified ones." />
          <CardBody>
            <TimesheetForm
              inchargers={inchargers}
              submitLabel="Save changes"
              initial={{
                date: editing.date,
                business: editing.business,
                task: editing.task,
                description: editing.description ?? "",
                sessions: editing.sessions ? String(editing.sessions) : "",
                hours: editing.hours ? String(editing.hours) : "",
                inchargeId: editing.inchargeId ?? "",
              }}
              onSubmit={editSubmit}
              onCancel={() => setEditing(null)}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="All timesheets"
          description="Advance visibility of non-teaching hours before they're invoiced."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={member} onChange={(e) => setMember(e.target.value)} className="w-44">
              <option value="all">All members</option>
              {memberNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-36">
              <option value="all">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select value={task} onChange={(e) => setTask(e.target.value as "all" | TimesheetTask)} className="w-44">
              <option value="all">All tasks</option>
              {TIMESHEET_TASKS.map((t) => (
                <option key={t} value={t}>
                  {TIMESHEET_TASK_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | TimesheetStatus)}
              className="w-40"
            >
              <option value="all">All statuses</option>
              {TIMESHEET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TIMESHEET_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </div>

          <TimesheetTable
            rows={filtered}
            showMember
            showIncharge
            actions={actions}
            emptyText="No timesheet entries match these filters."
          />
        </CardBody>
      </Card>
    </div>
  );
}
