"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithIdentifier } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signInWithIdentifier(identifier, password);
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }
    // Session cookie is set; let the server route by role.
    const dest = next && next.startsWith("/") ? next : "/";
    router.replace(dest);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        label="Employee ID or email"
        htmlFor="identifier"
        hint="Team members & department heads: use your 4-digit ID. HR: use your email."
      >
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="1042  or  you@example.com"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Button type="submit" fullWidth loading={loading}>
        Sign in
      </Button>
    </form>
  );
}
