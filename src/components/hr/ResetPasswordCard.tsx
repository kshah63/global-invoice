"use client";

import { useState } from "react";
import { resetTeamMemberPassword } from "@/actions/team-members";
import { resetDepartmentHeadPassword } from "@/actions/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function ResetPasswordCard({
  teamMemberId,
  deptHeadId,
}: {
  teamMemberId?: string;
  deptHeadId?: string;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const res = deptHeadId
      ? await resetDepartmentHeadPassword(deptHeadId, pw)
      : await resetTeamMemberPassword(teamMemberId!, pw);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(pw);
    setPw("");
  }

  return (
    <Card className="mt-8">
      <CardHeader
        title="Reset password"
        description="Set a new login password for this account."
      />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          {saved && (
            <Alert tone="success" title="Password updated">
              Share it securely (e.g. via WhatsApp). New password:{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-ink-800">
                {saved}
              </code>
            </Alert>
          )}
          <div className="flex items-end gap-3">
            <Field label="New password" className="flex-1">
              <Input
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
            <Button type="button" variant="neutral" onClick={() => setPw(randomPassword())}>
              Generate
            </Button>
          </div>
          <Button type="submit" loading={loading}>
            Set new password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
