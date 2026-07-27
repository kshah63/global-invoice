import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { MemberStatusBadge } from "@/components/MemberStatusBadge";
import { createMemberInvoice } from "@/actions/member-invoices";
import { formatCurrency } from "@/lib/format";
import { periodLabel } from "@/lib/constants";
import type {
  InvoicePeriod,
  SupplierMemberInvoice,
  TeamMember,
} from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function MemberOverview({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { profile } = await requireRole("supplier_member");
  const supabase = createClient();

  const { data: member } = await supabase
    .from("supplier_members")
    .select("id, name, supplier_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!member) {
    return (
      <>
        <PageHeader title="Welcome" />
        <Alert tone="warning" title="Profile not linked">
          Your login isn&apos;t linked to a roster record yet. Please ask your
          HR team to finish setting up your account.
        </Alert>
      </>
    );
  }

  // The supplier's team_members row isn't readable by a member under RLS, so
  // read the name with the admin client (name only).
  const admin = createAdminClient();
  const [{ data: supplier }, { data: periods }, { data: invoices }] =
    await Promise.all([
      admin
        .from("team_members")
        .select("name")
        .eq("id", member.supplier_id)
        .maybeSingle(),
      supabase
        .from("invoice_periods")
        .select("*")
        .eq("is_open", true)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase
        .from("supplier_member_invoices")
        .select("*")
        .eq("supplier_member_id", member.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false }),
    ]);

  const supplierName = (supplier as { name: string } | null)?.name ?? "your agency";
  const list = (invoices as SupplierMemberInvoice[] | null) ?? [];
  const byPeriod = new Map<string, SupplierMemberInvoice>();
  list.forEach((inv) => byPeriod.set(`${inv.period_year}-${inv.period_month}`, inv));
  const openPeriods = (periods as InvoicePeriod[] | null) ?? [];
  const returned = list.filter((i) => i.status === "returned");

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title={`Hello, ${member.name.split(" ")[0]}`}
        description={`Confirm your pay and add any adjustments — they go to ${supplierName} to review.`}
      />

      {returned.map((inv) => (
        <Alert key={inv.id} tone="warning" title="A submission was sent back" className="mb-4">
          {periodLabel(inv.period_year, inv.period_month)}
          {inv.return_note ? ` — “${inv.return_note}”` : ""}.{" "}
          <Link href={`/member/invoices/${inv.id}`} className="font-medium underline">
            Open and fix it
          </Link>
          .
        </Alert>
      ))}

      <Card>
        <CardHeader
          title="Open for invoicing"
          description="Months that are open. Start or continue your entries."
        />
        <CardBody className="space-y-3">
          {openPeriods.length === 0 && (
            <p className="text-sm text-ink-500">
              No months are open right now. HR will open the next month when
              it&apos;s time.
            </p>
          )}
          {openPeriods.map((p) => {
            const inv = byPeriod.get(`${p.year}-${p.month}`);
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
                      <MemberStatusBadge status={inv.status} />
                    ) : (
                      <span className="text-xs text-ink-400">Not started</span>
                    )}
                  </div>
                </div>
                {inv ? (
                  <Button href={`/member/invoices/${inv.id}`} size="sm" variant="brand-soft">
                    {inv.status === "draft" || inv.status === "returned" ? "Continue" : "View"}
                  </Button>
                ) : (
                  <form action={createMemberInvoice}>
                    <input type="hidden" name="period_year" value={p.year} />
                    <input type="hidden" name="period_month" value={p.month} />
                    <Button size="sm" type="submit">
                      Start entries
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Your submissions" />
        <CardBody>
          {list.length ? (
            <ul className="divide-y divide-ink-100">
              {list.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/member/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-ink-50"
                  >
                    <div className="font-medium text-ink-900">
                      {periodLabel(inv.period_year, inv.period_month)}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="tnum text-sm font-medium">
                        {formatCurrency(inv.total, inv.currency)}
                      </span>
                      <MemberStatusBadge status={inv.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nothing yet"
              description="When a month opens, start your entries from the panel above."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
