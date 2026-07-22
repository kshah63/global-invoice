import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { createInvoice } from "@/actions/invoices";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { periodLabel } from "@/lib/constants";
import type { Invoice, InvoicePeriod, Message, TeamMember } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function TeamOverview({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();

  const { data: tm } = await supabase
    .from("team_members")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!tm) {
    return (
      <>
        <PageHeader title="Welcome" />
        <Alert tone="warning" title="Profile not linked">
          Your login isn&apos;t linked to a team member record yet. Please ask
          your HR team to finish setting up your profile.
        </Alert>
      </>
    );
  }
  const member = tm as TeamMember;

  const [{ data: periods }, { data: invoices }, { data: messages }] =
    await Promise.all([
      supabase
        .from("invoice_periods")
        .select("*")
        .eq("is_open", true)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase
        .from("invoices")
        .select("*")
        .eq("team_member_id", member.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false }),
      supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const invoiceByPeriod = new Map<string, Invoice>();
  (invoices as Invoice[] | null)?.forEach((inv) =>
    invoiceByPeriod.set(`${inv.period_year}-${inv.period_month}`, inv)
  );

  const openPeriods = (periods as InvoicePeriod[] | null) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title={`Hello, ${member.name.split(" ")[0]}`}
        description="Track your sessions and complete your monthly invoice."
        action={
          <Button href="/team/invoices" variant="neutral">
            All invoices
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Open for invoicing"
              description="Months HR has opened. Start or continue your invoice."
            />
            <CardBody className="space-y-3">
              {openPeriods.length === 0 && (
                <p className="text-sm text-ink-500">
                  No months are open for invoicing right now. HR will let you
                  know when the next month opens.
                </p>
              )}
              {openPeriods.map((p) => {
                const inv = invoiceByPeriod.get(`${p.year}-${p.month}`);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-ink-900">
                        {periodLabel(p.year, p.month)}
                      </div>
                      <div className="mt-0.5">
                        {inv ? (
                          <StatusPill status={inv.status} />
                        ) : (
                          <span className="text-xs text-ink-400">Not started</span>
                        )}
                      </div>
                    </div>
                    {inv ? (
                      <Button href={`/team/invoices/${inv.id}`} size="sm" variant="brand-soft">
                        Continue
                      </Button>
                    ) : (
                      <form action={createInvoice}>
                        <input type="hidden" name="period_year" value={p.year} />
                        <input type="hidden" name="period_month" value={p.month} />
                        <Button size="sm" type="submit">
                          Start invoice
                        </Button>
                      </form>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent invoices"
              action={
                <Link href="/team/invoices" className="text-sm text-brand-600 hover:underline">
                  View all
                </Link>
              }
            />
            <CardBody>
              {(invoices as Invoice[] | null)?.length ? (
                <ul className="divide-y divide-ink-100">
                  {(invoices as Invoice[]).slice(0, 5).map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/team/invoices/${inv.id}`}
                        className="flex items-center justify-between gap-3 py-3 hover:bg-ink-50"
                      >
                        <div>
                          <div className="font-medium text-ink-900">
                            {periodLabel(inv.period_year, inv.period_month)}
                          </div>
                          <div className="font-mono text-xs text-ink-400 tnum">
                            {inv.invoice_number}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="tnum text-sm font-medium">
                            {formatCurrency(inv.total, inv.currency)}
                          </span>
                          <StatusPill status={inv.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No invoices yet"
                  description="When a month opens, start your first invoice from the panel above."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Messages from HR" />
            <CardBody>
              {(messages as Message[] | null)?.length ? (
                <ul className="space-y-4">
                  {(messages as Message[]).map((m) => (
                    <li key={m.id} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                      <div className="text-sm font-semibold text-ink-900">
                        {m.subject}
                      </div>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink-600">
                        {m.body}
                      </p>
                      <div className="mt-1 text-xs text-ink-400">
                        {m.sender_name ?? "HR"} · {formatDateTime(m.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">No messages yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
