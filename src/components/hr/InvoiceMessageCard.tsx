"use client";

import { useState } from "react";
import Link from "next/link";
import { hrSendToProfile } from "@/actions/direct-messages";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function InvoiceMessageCard({
  participantProfileId,
  participantName,
  invoiceNumber,
}: {
  participantProfileId: string;
  participantName: string;
  invoiceNumber: string;
}) {
  const [body, setBody] = useState(`Re: ${invoiceNumber} — `);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const res = await hrSendToProfile(participantProfileId, text);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setSentId(res.id ?? null);
      setBody("");
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={`Message ${participantName}`}
        description="Send invoice feedback straight to them in the app — no WhatsApp needed."
      />
      <CardBody className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {sentId && (
          <Alert tone="success">
            Sent.{" "}
            <Link href={`/hr/inbox/${sentId}`} className="font-medium underline">
              Open the conversation
            </Link>
            .
          </Alert>
        )}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your feedback…"
          className="min-h-[80px]"
        />
        <Button type="button" onClick={send} loading={busy}>
          Send message
        </Button>
      </CardBody>
    </Card>
  );
}
