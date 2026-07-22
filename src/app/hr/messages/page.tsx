import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { sendBroadcast } from "@/actions/messages";
import { MONTH_NAMES, periodLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { Message } from "@/lib/types";

export const metadata = { title: "Messages" };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const now = new Date();
  const supabase = createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const messages = (data as Message[]) ?? [];

  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) years.push(y);

  const defaultBody =
    "Hi team,\n\nInvoicing for the month is now open. Please complete and submit your invoice by the end of the month.\n\nThank you!";

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Messages"
        description="Send an announcement to all Global Online team members."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New message" description="Delivered to every team member." />
          <CardBody>
            <form action={sendBroadcast} className="space-y-4">
              <Field label="Subject" required>
                <Input
                  name="subject"
                  required
                  defaultValue="Invoicing is open for the month"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Relates to month (optional)">
                  <Select name="period_month" defaultValue="">
                    <option value="">—</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Year (optional)">
                  <Select name="period_year" defaultValue="">
                    <option value="">—</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Message" required>
                <Textarea
                  name="body"
                  required
                  rows={7}
                  defaultValue={defaultBody}
                />
              </Field>
              <SubmitButton>Send to all team members</SubmitButton>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sent messages" />
          <CardBody>
            {messages.length === 0 ? (
              <p className="text-sm text-ink-500">No messages sent yet.</p>
            ) : (
              <ul className="space-y-4">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className="border-b border-ink-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-900">
                        {m.subject}
                      </span>
                      {m.period_month && m.period_year && (
                        <span className="text-xs text-ink-400">
                          {periodLabel(m.period_year, m.period_month)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-ink-600">
                      {m.body}
                    </p>
                    <div className="mt-1 text-xs text-ink-400">
                      {formatDateTime(m.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
