"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<null | boolean>(null); // null = checking
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  }

  if (ready === null) {
    return <p className="text-sm text-ink-500">Checking your reset link…</p>;
  }

  if (!ready) {
    return (
      <Alert tone="danger" title="Link invalid or expired">
        Please{" "}
        <Link href="/forgot-password" className="font-medium underline">
          request a new reset link
        </Link>
        .
      </Alert>
    );
  }

  if (done) {
    return <Alert tone="success">Password updated. Signing you in…</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="New password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" fullWidth loading={loading}>
        Update password
      </Button>
    </form>
  );
}
