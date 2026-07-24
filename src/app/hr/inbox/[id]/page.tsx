import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { MessageThread } from "@/components/MessageThread";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import type { Conversation, DirectMessage } from "@/lib/types";

export const metadata = { title: "Conversation" };

export default async function HrConversation({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: convRow } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!convRow) notFound();
  const conv = convRow as Conversation;

  const [{ data: msgs }, { data: pRow }] = await Promise.all([
    supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", params.id)
      .order("created_at"),
    supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", conv.participant_id)
      .maybeSingle(),
  ]);
  const participant = pRow as { full_name: string | null; email: string; role: Role } | null;

  const name = participant?.full_name ?? participant?.email ?? "Conversation";
  const hadUnread =
    !conv.last_message_from_hr &&
    (!conv.hr_last_read_at || conv.last_message_at > conv.hr_last_read_at);

  return (
    <>
      <div className="mb-4">
        <Link href="/hr/inbox" className="text-sm text-brand-600 hover:underline">
          ← Inbox
        </Link>
      </div>
      <PageHeader
        title={name}
        description={participant ? ROLE_LABELS[participant.role] : undefined}
      />
      <MessageThread
        conversationId={conv.id}
        messages={(msgs as DirectMessage[]) ?? []}
        meIsHr
        hadUnread={hadUnread}
      />
    </>
  );
}
