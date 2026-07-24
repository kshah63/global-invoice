"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postDirectMessage, markConversationRead } from "@/actions/direct-messages";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { formatDateTime } from "@/lib/format";
import type { DirectMessage } from "@/lib/types";

/**
 * Shared 1:1 message thread. `meIsHr` decides which side "my" messages sit on.
 */
export function MessageThread({
  conversationId,
  messages,
  meIsHr,
  hadUnread,
}: {
  conversationId: string;
  messages: DirectMessage[];
  meIsHr: boolean;
  hadUnread?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Mark read on open (once).
  useEffect(() => {
    if (hadUnread) {
      markConversationRead(conversationId).then(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const res = await postDirectMessage(conversationId, text);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setBody("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl border border-ink-200 bg-ink-50/40 p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-400">
            No messages yet. Say hello below.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.from_hr === meIsHr;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "bg-brand-600 text-white"
                      : "bg-white text-ink-800 ring-1 ring-ink-200"
                  }`}
                >
                  <div className="whitespace-pre-line">{m.body}</div>
                  <div
                    className={`mt-1 text-[0.65rem] ${mine ? "text-brand-100" : "text-ink-400"}`}
                  >
                    {m.from_hr ? "HR" : "Them"} · {formatDateTime(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          className="min-h-[44px]"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <Button type="button" onClick={send} loading={busy}>
          Send
        </Button>
      </div>
    </div>
  );
}
