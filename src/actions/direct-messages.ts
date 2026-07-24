"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

/** HR: find or create the thread for a given person (by their profile id). */
export async function hrGetOrCreateConversation(
  participantProfileId: string
): Promise<{ id?: string; error?: string }> {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return { error: "Not allowed." };
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_id", participantProfileId)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({ participant_id: participantProfileId })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not start the conversation." };
  return { id: data.id };
}

/** Participant: find or create their own thread with HR. */
export async function getOrCreateMyConversation(): Promise<{
  id?: string;
  error?: string;
}> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_id", session.profile.id)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({ participant_id: session.profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not start the conversation." };
  return { id: data.id };
}

export async function postDirectMessage(
  conversationId: string,
  body: string
): Promise<{ error?: string }> {
  const text = body.trim();
  if (!text) return { error: "Write a message first." };
  const supabase = createClient();
  // sender_id + from_hr are set server-side by a trigger.
  const { error } = await supabase
    .from("direct_messages")
    .insert({ conversation_id: conversationId, body: text });
  if (error) return { error: error.message };

  // Sending implies you've read the thread.
  await markConversationRead(conversationId);

  revalidatePath("/hr/inbox");
  revalidatePath(`/hr/inbox/${conversationId}`);
  revalidatePath("/messages");
  return {};
}

/** Mark a thread read for whichever side the caller is on. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const supabase = createClient();
  const field =
    session.profile.role === "hr" ? "hr_last_read_at" : "participant_last_read_at";
  await supabase
    .from("conversations")
    .update({ [field]: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Does the current person have an unread message from HR? (for the nav badge) */
export async function myUnread(): Promise<boolean> {
  const session = await getSession();
  if (!session || session.profile.role === "hr") return false;
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select("last_message_from_hr, last_message_at, participant_last_read_at")
    .eq("participant_id", session.profile.id)
    .maybeSingle();
  if (!data) return false;
  return (
    data.last_message_from_hr &&
    (!data.participant_last_read_at || data.last_message_at > data.participant_last_read_at)
  );
}

/** HR: send a message to a person by profile id (creates the thread if needed). */
export async function hrSendToProfile(
  participantProfileId: string,
  body: string
): Promise<{ error?: string; id?: string }> {
  const conv = await hrGetOrCreateConversation(participantProfileId);
  if (conv.error || !conv.id) return { error: conv.error };
  const res = await postDirectMessage(conv.id, body);
  if (res.error) return { error: res.error };
  return { id: conv.id };
}
