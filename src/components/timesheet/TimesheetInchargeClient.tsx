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
  timesheetAddForMember,
  timesheetUpdate,
  timesheetVerify,
  timesheetReturn,
  timesheetDelete,
} from "@/actions/timesheet";
import type { TimesheetInput } from "@/lib/types";

export function TimesheetInchargeClient({
  rows,
  members,
}: {
  rows: TimesheetRowView[];
  members: { id: string; name: string }[];
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
    const r = await timesheetAddForMember(v);
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

  const toReview = rows.filter((r) => r.status === "pending_review");
  const mine = rows.filter(
    (r) => r.createdByIncharge && (r.status === "pending_acceptance" || r.status === "returned")
  );
  const verified = rows.filter((r) => r.status === "verified");

  function reviewActions(r: TimesheetRowView) {
    return (
      <>
        <MiniButton tone="primary" onClick={() => run(() => timesheetVerify(r.id))}>
          Verify
        </MiniButton>
        <ReturnControl onReturn={async (note) => void (await run(() => timesheetReturn(r.id, note)))} />
      </>
    );
  }
  function mineActions(r: TimesheetRowView) {
    return (
      <>
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

      <Card>
        <CardHeader
          title={`To review (${toReview.length})`}
          description="Entries members submitted for you to verify."
        />
        <CardBody className="p-0">
          <div className="p-4">
            <TimesheetTable
              rows={toReview}
              showMember
              actions={reviewActions}
              emptyText="Nothing to review right now."
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={editing ? "Edit entry" : "Add an entry for a member"}
          description="Log work on a member's behalf. They'll accept it to confirm."
        />
        <CardBody>
          {editing ? (
            <TimesheetForm
              submitLabel="Save changes"
              initial={{
                date: editing.date,
                business: editing.business,
                task: editing.task,
                description: editing.description ?? "",
                sessions: editing.sessions ? String(editing.sessions) : "",
                hours: editing.hours ? String(editing.hours) : "",
              }}
              onSubmit={editSubmit}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <TimesheetForm members={members} submitLabel="Add to member's timesheet" onSubmit={addSubmit} />
          )}
        </CardBody>
      </Card>

      {mine.length > 0 && (
        <Card>
          <CardHeader
            title="Added by me · awaiting the member"
            description="Entries you added that the member hasn't accepted yet."
          />
          <CardBody className="p-0">
            <div className="p-4">
              <TimesheetTable rows={mine} showMember actions={mineActions} />
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Verified" description="Confirmed entries assigned to you." />
        <CardBody className="p-0">
          <div className="p-4">
            <TimesheetTable rows={verified} showMember emptyText="No verified entries yet." />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
