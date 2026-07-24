"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hrGetOrCreateConversation } from "@/actions/direct-messages";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";

export interface MessagablePerson {
  id: string; // profile id
  name: string;
  roleLabel: string;
}

export function NewConversation({ people }: { people: MessagablePerson[] }) {
  const router = useRouter();
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!pid) return;
    setBusy(true);
    const res = await hrGetOrCreateConversation(pid);
    setBusy(false);
    if (res.id) router.push(`/hr/inbox/${res.id}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={pid}
        onChange={(e) => setPid(e.target.value)}
        className="max-w-xs"
      >
        <option value="">Start a new message…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.roleLabel}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" onClick={start} loading={busy} disabled={!pid}>
        Open
      </Button>
    </div>
  );
}
