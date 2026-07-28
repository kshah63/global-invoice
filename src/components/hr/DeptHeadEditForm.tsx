"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDepartmentHead } from "@/actions/settings";
import { CENTRES, type Centre } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function DeptHeadEditForm({
  id,
  initial,
}: {
  id: string;
  initial: { name: string; email: string; loginCode: string; business: Centre };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [loginCode, setLoginCode] = useState(initial.loginCode);
  const [business, setBusiness] = useState<Centre>(initial.business);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^[A-Za-z0-9]{4,6}$/.test(loginCode.trim())) {
      setError("Login ID must be 4–6 letters or numbers.");
      return;
    }
    setSaving(true);
    const res = await updateDepartmentHead(id, {
      name: name.trim(),
      email: email.trim(),
      business,
      loginCode: loginCode.trim(),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotice("Details saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email" hint="Optional — for password resets. They can sign in by ID.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label="Login ID (4–6 characters)"
          required
          hint="Letters or numbers. They sign in with this."
        >
          <Input
            value={loginCode}
            onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
            maxLength={6}
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
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Save details
        </Button>
        <Button href="/hr/team-members" variant="ghost">
          Back to People
        </Button>
      </div>
    </form>
  );
}
