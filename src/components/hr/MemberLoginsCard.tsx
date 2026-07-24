"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createMemberLogin,
  resetMemberPassword,
  removeMemberLogin,
} from "@/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export interface MemberLoginRow {
  id: string;
  name: string;
  code: string;
  email: string | null;
  hasLogin: boolean;
}

function Row({ member }: { member: MemberLoginRow }) {
  const router = useRouter();
  const [email, setEmail] = useState(member.email ?? "");
  const [password, setPassword] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await createMemberLogin(member.id, {
      email: email.trim(),
      password: password.trim() || undefined,
      sendWelcomeEmail: sendEmail,
    });
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      setMsg(res.message ?? "Login created.");
      setPassword("");
      router.refresh();
    }
  }
  async function onReset() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await resetMemberPassword(member.id, password.trim());
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      setMsg("Password updated.");
      setPassword("");
    }
  }
  async function onRemove() {
    if (!confirm(`Remove ${member.name}'s login? They'll no longer be able to sign in.`)) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await removeMemberLogin(member.id);
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      setMsg("Login removed.");
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-ink-900">{member.name}</span>
          <span className="ml-2 font-mono text-xs text-ink-400">{member.code}</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            member.hasLogin
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-ink-100 text-ink-600 ring-ink-200"
          }`}
        >
          {member.hasLogin ? "Has login" : "No login"}
        </span>
      </div>

      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      {msg && <Alert tone="success" className="mb-3">{msg}</Alert>}

      {member.hasLogin ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Reset password" hint={member.email ?? `Signs in with ID ${member.code}`}>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" size="sm" variant="neutral" loading={busy} onClick={onReset}>
              Reset
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            They sign in with their ID{" "}
            <span className="font-mono font-medium text-ink-700">{member.code}</span>. An
            email is optional — add one only if they should get a set-password link.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Login email (optional)">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Leave blank — they log in by ID"
              />
            </Field>
            <Field
              label="Initial password"
              hint={email.includes("@") ? "Or send a set-password email below." : "Required (no email)."}
            >
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 8 characters"
              />
            </Field>
          </div>
          {email.includes("@") && (
            <label className="flex items-center gap-2 text-sm text-ink-600">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300"
              />
              Send a set-password email
            </label>
          )}
          <Button type="button" size="sm" loading={busy} onClick={onCreate}>
            Create login
          </Button>
        </div>
      )}
    </div>
  );
}

export function MemberLoginsCard({ members }: { members: MemberLoginRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Member logins"
        description="Give a roster member their own login so they can enter and submit their own work to the leader."
      />
      <CardBody className="space-y-3">
        {members.length === 0 ? (
          <p className="text-sm text-ink-500">
            Add people to the roster above first, then you can create their logins here.
          </p>
        ) : (
          members.map((m) => <Row key={m.id} member={m} />)
        )}
      </CardBody>
    </Card>
  );
}
