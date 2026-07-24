import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateMyConversation } from "@/actions/direct-messages";
import { ROLE_HOME } from "@/lib/constants";
import { BrandWordmark } from "@/components/BrandMark";
import { MessageThread } from "@/components/MessageThread";
import { Alert } from "@/components/ui/Feedback";
import type { Conversation, DirectMessage } from "@/lib/types";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { profile } = await requireUser();
  if (profile.role === "hr") redirect("/hr/inbox");
  const home = ROLE_HOME[profile.role] ?? "/";

  const conv = await getOrCreateMyConversation();
  const supabase = createClient();

  let messages: DirectMessage[] = [];
  let hadUnread = false;
  if (conv.id) {
    const [{ data: msgs }, { data: c }] = await Promise.all([
      supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at"),
      supabase.from("conversations").select("*").eq("id", conv.id).maybeSingle(),
    ]);
    messages = (msgs as DirectMessage[]) ?? [];
    const cc = c as Conversation | null;
    hadUnread =
      !!cc &&
      cc.last_message_from_hr &&
      (!cc.participant_last_read_at || cc.last_message_at > cc.participant_last_read_at);
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="app-container flex h-16 items-center justify-between">
          <Link href={home} className="rounded-lg">
            <BrandWordmark />
          </Link>
          <Link href={home} className="text-sm text-brand-600 hover:underline">
            ← Back
          </Link>
        </div>
      </header>

      <div className="app-container max-w-2xl py-8">
        <h1 className="text-2xl font-semibold text-ink-900">Messages</h1>
        <p className="mt-1 text-sm text-ink-500">
          A direct line to the HR team — questions or feedback on your invoices.
        </p>

        <div className="mt-6">
          {conv.id ? (
            <MessageThread
              conversationId={conv.id}
              messages={messages}
              meIsHr={false}
              hadUnread={hadUnread}
            />
          ) : (
            <Alert tone="danger">{conv.error ?? "Could not open your messages."}</Alert>
          )}
        </div>
      </div>
    </main>
  );
}
