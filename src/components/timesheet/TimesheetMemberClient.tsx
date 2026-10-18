"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { TimesheetForm } from "@/components/timesheet/TimesheetForm";
import {
  TimesheetTable,
  ReturnControl,
  MiniButton,
  type TimesheetRowView,
} from "@/components/timesheet/TimesheetTable";
import {
  timesheetAdd,
  timesheetUpdate,
  timesheetAccept,
  timesheetReturn,
  timesheetDelete,
} from "@/actions/timesheet";
import type { TimesheetInput } from "@/lib/types";

export function TimesheetMemberClient({
  rows,
  inchargers,
}: {
  rows: TimesheetRowView[];
  inchargers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TimesheetRowView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error);
    else router.refresh();
  }

  async function addSubmit(v: TimesheetInput) {
    const r = await timesheetAdd(v);
    if (!r.error) router.refresh();
    return r;
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

  const toAccept = rows.filter((r) => r.createdByIncharge && r.status === "pending_acceptance");

  function actions(r: TimesheetRowView) {
    // In-charge-added line awaiting my acceptance.
    if (r.createdByIncharge && r.status === "pending_acceptance") {
      return (
        <>
          <MiniButton tone="primary" onClick={() => run(() => timesheetAccept(r.id))}>
            Accept
          </MiniButton>
          <ReturnControl onReturn={async (note) => void (await run(() => timesheetReturn(r.id, note)))} />
        </>
      );
    }
    // My own line, still editable.
    if (!r.createdByIncharge && (r.status === "pending_review" || r.status === "returned")) {
      return (
        <>
          <MiniButton onClick={() => setEditing(r)}>Edit</MiniButton>
          <MiniButton tone="danger" onClick={() => run(() => timesheetDelete(r.id))}>
            Delete
          </MiniButton>
        </>
      );
    }
    if (r.status === "verified") return <span className="text-xs text-ink-400">Locked</span>;
    if (r.createdByIncharge && r.status === "returned")
      return <span className="text-xs text-ink-400">Awaiting in-charge</span>;
    return null;
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader
          title={editing ? "Edit entry" : "Add a timesheet entry"}
          description="Log what you worked on. Your in-charge (or HR) verifies it."
        />
        <CardBody>
          {editing ? (
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
          ) : (
            <TimesheetForm inchargers={inchargers} onSubmit={addSubmit} />
          )}
        </CardBody>
      </Card>

      {toAccept.length > 0 && (
        <Card>
          <CardHeader
            title={`To accept (${toAccept.length})`}
            description="Your in-charge added these to your timesheet. Accept to confirm, or send back with a note."
          />
          <CardBody className="p-0">
            <div className="p-4">
              <TimesheetTable rows={toAccept} showIncharge actions={actions} />
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="My timesheet" description="Everything you've logged this and previous months." />
        <CardBody className="p-0">
          <div className="p-4">
            <TimesheetTable
              rows={rows}
              showIncharge
              actions={actions}
              emptyText="No entries yet. Add your first above."
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
