"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/format";
import {
  TIMESHEET_TASK_LABELS,
  TIMESHEET_STATUS_META,
  type Centre,
  type TimesheetStatus,
  type TimesheetTask,
} from "@/lib/constants";

export interface TimesheetRowView {
  id: string;
  date: string;
  business: Centre;
  task: TimesheetTask;
  description: string | null;
  sessions: number;
  hours: number;
  status: TimesheetStatus;
  inchargeId: string | null;
  inchargeName: string | null;
  memberName: string | null;
  returnNote: string | null;
  createdByIncharge: boolean;
}

export function TimesheetTable({
  rows,
  showMember = false,
  showIncharge = false,
  actions,
  emptyText = "Nothing here yet.",
}: {
  rows: TimesheetRowView[];
  showMember?: boolean;
  showIncharge?: boolean;
  actions?: (r: TimesheetRowView) => React.ReactNode;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-1 py-3 text-sm text-ink-500">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
            <th className="px-3 py-2 font-semibold">Date</th>
            {showMember && <th className="px-3 py-2 font-semibold">Member</th>}
            <th className="px-3 py-2 font-semibold">Business</th>
            <th className="px-3 py-2 font-semibold">Task</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Sessions</th>
            <th className="px-3 py-2 text-right font-semibold">Hours</th>
            {showIncharge && <th className="px-3 py-2 font-semibold">In-charge</th>}
            <th className="px-3 py-2 font-semibold">Status</th>
            {actions && <th className="px-3 py-2 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const meta = TIMESHEET_STATUS_META[r.status];
            return (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 tnum text-ink-700">{r.date}</td>
                {showMember && <td className="px-3 py-2 text-ink-800">{r.memberName ?? "—"}</td>}
                <td className="px-3 py-2 text-ink-600">{r.business}</td>
                <td className="px-3 py-2 text-ink-800">{TIMESHEET_TASK_LABELS[r.task]}</td>
                <td className="px-3 py-2 text-ink-600">
                  <div>{r.description || "—"}</div>
                  {r.status === "returned" && r.returnNote && (
                    <div className="mt-1 text-xs font-medium text-rose-600">
                      Returned: “{r.returnNote}”
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tnum">
                  {r.sessions ? formatNumber(r.sessions) : "—"}
                </td>
                <td className="px-3 py-2 text-right tnum">
                  {r.hours ? formatNumber(r.hours) : "—"}
                </td>
                {showIncharge && (
                  <td className="px-3 py-2 text-ink-600">{r.inchargeName ?? "—"}</td>
                )}
                <td className="px-3 py-2">
                  <Badge className={`${meta.badge} ring-1`}>{meta.label}</Badge>
                </td>
                {actions && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {actions(r)}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Inline "return with a note" control used by reviewers. */
export function ReturnControl({
  onReturn,
}: {
  onReturn: (note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink-200 px-2 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50"
      >
        Return
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason"
        className="w-36 rounded-lg border border-ink-200 px-2 py-1 text-xs"
      />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onReturn(note);
          setBusy(false);
          setOpen(false);
          setNote("");
        }}
        className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        Send back
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-1.5 py-1 text-xs text-ink-500 hover:bg-ink-100"
      >
        ✕
      </button>
    </div>
  );
}

/** Small neutral action button. */
export function MiniButton({
  children,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
      : tone === "danger"
        ? "border-ink-200 text-red-600 hover:bg-red-50"
        : "border-ink-200 text-ink-600 hover:bg-ink-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </button>
  );
}
