import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import {
  NewConversation,
  type MessagablePerson,
} from "@/components/hr/NewConversation";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";

export const metadata = { title: "Inbox" };

type Profile = { id: string; full_name: string | null; email: string; role: Role };

export default async function HrInbox() {
  await requireRole("hr");
  const supabase = createClient();

  const [{ data: convRows }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .neq("role", "hr")
      .order("full_name"),
  ]);

  const rows = (convRows as Conversation[]) ?? [];
  const profiles = (peopleRows as Profile[]) ?? [];
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const people: MessagablePerson[] = profiles.map((p) => ({
    id: p.id,
    name: p.full_name ?? p.email,
    roleLabel: ROLE_LABELS[p.role],
  }));

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Direct messages with individuals — invoice feedback, questions, anything."
      />

      <Card className="mb-6">
        <CardBody>
          <NewConversation people={people} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Conversations" />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No conversations yet"
                description="Start one above, or use the “Message” button on someone's invoice."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {rows.map((c) => {
                const unread =
                  !c.last_message_from_hr &&
                  (!c.hr_last_read_at || c.last_message_at > c.hr_last_read_at);
                const p = byId.get(c.participant_id);
                const name = p?.full_name ?? p?.email ?? "Unknown";
                return (
                  <li key={c.id}>
                    <Link
                      href={`/hr/inbox/${c.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-ink-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {unread && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                          )}
                          <span
                            className={`truncate ${unread ? "font-semibold text-ink-900" : "font-medium text-ink-800"}`}
                          >
                            {name}
                          </span>
                          {p && (
                            <span className="shrink-0 text-xs text-ink-400">
                              {ROLE_LABELS[p.role]}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-sm text-ink-500">
                          {c.last_message_from_hr ? "You: " : ""}
                          {c.last_message_preview ?? "No messages yet"}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-ink-400">
                        {formatDateTime(c.last_message_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
