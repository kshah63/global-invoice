"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { returnMemberInvoice } from "@/actions/member-invoices";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { formatCurrency } from "@/lib/format";
import type { Currency, MemberInvoiceStatus } from "@/lib/constants";

export interface MemberSubmissionRow {
  id: string;
  memberName: string;
  status: MemberInvoiceStatus;
  total: number;
  currency: Currency;
  returnNote: string | null;
}

export function MemberSubmissionsPanel({
  consolidatedInvoiceId,
  submissions,
}: {
  consolidatedInvoiceId: string;
  submissions: MemberSubmissionRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submittedCount = submissions.filter((s) => s.status === "submitted").length;

  async function sendBack(id: string) {
    const note = window.prompt("What should this member fix? (optional note)") ?? "";
    setBusyId(id);
    setError(null);
    const res = await returnMemberInvoice(id, note, consolidatedInvoiceId);
    setBusyId(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Member submissions"
        description={
          submittedCount > 0
            ? `${submittedCount} ready to pull into this invoice. Use “Pull in” below, or send one back to fix.`
            : "Each roster member's own entries appear here once they submit."
        }
      />
      <CardBody className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-500">No members have submitted yet.</p>
        ) : (
          submissions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
            >
              <div>
                <div className="font-medium text-ink-900">{s.memberName}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <MemberStatusBadge status={s.status} />
                  {s.status === "returned" && s.returnNote && (
                    <span className="text-xs text-ink-400">“{s.returnNote}”</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="tnum text-sm font-medium">
                  {formatCurrency(s.total, s.currency)}
                </span>
                {s.status === "submitted" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={busyId === s.id}
                    onClick={() => sendBack(s.id)}
                  >
                    Send back
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
