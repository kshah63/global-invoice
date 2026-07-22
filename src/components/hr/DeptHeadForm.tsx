"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDepartmentHead } from "@/actions/settings";
import { CENTRES, type Centre } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function DeptHeadForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState<Centre>("MathVision");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!/^[0-9]{4}$/.test(loginCode.trim())) {
      setError("Login ID must be a 4-digit code.");
      return;
    }
    if (password.length < 8) {
      setError("Set a password of at least 8 characters.");
      return;
    }
    setSaving(true);
    const res = await createDepartmentHead({
      name,
      email,
      password,
      business,
      loginCode: loginCode.trim(),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOk(`${name} added as department head for ${business} (login ID ${loginCode.trim()}).`);
    setName("");
    setEmail("");
    setLoginCode("");
    setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email" required hint="For password resets.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Login ID (4 digits)" required hint="They sign in with this.">
          <Input
            value={loginCode}
            onChange={(e) => setLoginCode(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            placeholder="2001"
            required
          />
        </Field>
        <Field label="Business" required>
          <Select value={business} onChange={(e) => setBusiness(e.target.value as Centre)}>
            {CENTRES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Initial password" required>
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={() => setPassword(randomPassword())}
            >
              Generate
            </Button>
          </div>
        </Field>
      </div>
      <Button type="submit" loading={saving}>
        Add department head
      </Button>
    </form>
  );
}
