"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { unlockGlobalOnline } from "@/actions/gate";
import { BrandWordmark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export function GlobalOnlineGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await unlockGlobalOnline(password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.replace("/hr");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandWordmark />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink-900">Global Online</h1>
          <p className="mt-1 text-sm text-ink-500">
            Enter the access password to open the invoicing section.
          </p>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            {error && <Alert tone="danger">{error}</Alert>}
            <div>
              <Label htmlFor="go_password">Access password</Label>
              <Input
                id="go_password"
                type="password"
                value={password}
                autoFocus
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" loading={busy} className="w-full">
              Enter
            </Button>
          </form>
        </div>
        <div className="mt-4 text-center">
          <Link href="/hub" className="text-sm text-brand-600 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
