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
import { formatCurrency } from "@/lib/format";
import { periodLabel } from "@/lib/constants";
import type { Invoice, InvoicePeriod, TeamMember } from "@/lib/types";

export const metadata = { title: "My Invoices" };

export default async function TeamInvoicesPage({
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
        <PageHeader title="My Invoices" />
        <Alert tone="warning">Your login isn&apos;t linked to a team member record yet.</Alert>
      </>
    );
  }
  const member = tm as TeamMember;

  const [{ data: invoices }, { data: periods }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("team_member_id", member.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    supabase
      .from("invoice_periods")
      .select("*")
      .eq("is_open", true)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
  ]);

  const started = new Set(
    (invoices as Invoice[] | null)?.map((i) => `${i.period_year}-${i.period_month}`)
  );
  const startable = ((periods as InvoicePeriod[] | null) ?? []).filter(
    (p) => !started.has(`${p.year}-${p.month}`)
  );

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader title="My Invoices" description="Every invoice you've started, with its status." />

      {startable.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Start a new invoice" description="These months are open." />
          <CardBody className="flex flex-wrap gap-3">
            {startable.map((p) => (
              <form action={createInvoice} key={p.id}>
                <input type="hidden" name="period_year" value={p.year} />
                <input type="hidden" name="period_month" value={p.month} />
                <Button size="sm" variant="brand-soft" type="submit">
                  + {periodLabel(p.year, p.month)}
                </Button>
              </form>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          {(invoices as Invoice[] | null)?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Period</th>
                    <th className="px-5 py-3 font-semibold">Invoice #</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(invoices as Invoice[]).map((inv) => (
                    <tr key={inv.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-medium text-ink-900">
                        {periodLabel(inv.period_year, inv.period_month)}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3 text-right tnum">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/team/invoices/${inv.id}`}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                          >
                            Open
                          </Link>
                          <Link
                            href={`/print/invoice/${inv.id}`}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
                          >
                            Download
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No invoices yet"
                description="Start one from an open month above."
              />
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
