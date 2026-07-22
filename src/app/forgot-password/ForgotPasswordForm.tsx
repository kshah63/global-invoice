"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await requestPasswordReset(identifier);
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Alert tone="success" title="Check your email">
        If an account matches that employee ID or email, a password-reset link is
        on its way. The link expires shortly, so use it soon.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Employee ID or email" htmlFor="identifier">
        <Input
          id="identifier"
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="1042  or  you@example.com"
        />
      </Field>
      <Button type="submit" fullWidth loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}
