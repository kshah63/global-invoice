import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import {
  ROSTER_ROLE_LABELS,
  RATE_UNIT_LABELS,
  periodLabel,
  type Currency,
  type RateUnit,
  type RosterRole,
} from "@/lib/constants";
import type { SupplierMember, SupplierMemberRate, TeamMember } from "@/lib/types";

export const metadata = { title: "Roster" };

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
  ) : (
    <Badge className="bg-ink-100 text-ink-600 ring-ink-200">Inactive</Badge>
  );
}

export default async function RosterPage() {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();

  const { data: tmRow } = await supabase
    .from("team_members")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const supplier = tmRow as TeamMember | null;
  // Only supplier leaders have a roster.
  if (!supplier || supplier.member_type !== "supplier") redirect("/team");

  const supplierCurrency = supplier.currency as Currency;

  const { data: memberRows } = await supabase
    .from("supplier_members")
    .select("*")
    .eq("supplier_id", supplier.id)
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");
  const members = (memberRows as SupplierMember[]) ?? [];
  const activeCount = members.filter((m) => m.active).length;

  const ids = members.map((m) => m.id);
  const { data: rateRows } = ids.length
    ? await supabase
        .from("supplier_member_rates")
        .select("*")
        .in("supplier_member_id", ids)
        .order("sort_order")
    : { data: [] as SupplierMemberRate[] };
  const ratesByMember = new Map<string, SupplierMemberRate[]>();
  ((rateRows as SupplierMemberRate[]) ?? []).forEach((r) => {
    const arr = ratesByMember.get(r.supplier_member_id) ?? [];
    arr.push(r);
    ratesByMember.set(r.supplier_member_id, arr);
  });

  function payLines(m: SupplierMember): string[] {
    const cur = (m.payment_currency ?? supplierCurrency) as Currency;
    if (m.pay_type === "fixed") {
      const amt = m.monthly_salary != null ? Number(m.monthly_salary) : 0;
      return [`${formatCurrency(amt, cur)} / month`];
    }
    const rows = ratesByMember.get(m.id) ?? [];
    const list = rows.map((r) => {
      const label = RATE_UNIT_LABELS[r.unit as RateUnit] ?? "";
      const desc = r.descriptor ? ` · ${r.descriptor}` : "";
      return `${formatCurrency(Number(r.amount), cur)} ${label}${desc}`;
    });
    // Fall back to the mirrored single rate if no rate rows exist yet.
    if (list.length === 0 && Number(m.rate_amount) > 0) {
      const label = RATE_UNIT_LABELS[m.rate_unit as RateUnit] ?? "";
      const desc = m.rate_descriptor ? ` · ${m.rate_descriptor}` : "";
      list.push(`${formatCurrency(Number(m.rate_amount), cur)} ${label}${desc}`);
    }
    return list;
  }

  // Submissions by month: how many people have handed in their time, and how
  // many are still outstanding. We look across all of this supplier's member
  // submissions plus any open months (so a month with none still appears).
  const [{ data: subAll }, { data: openP }] = await Promise.all([
    supabase
      .from("supplier_member_invoices")
      .select("period_year, period_month, supplier_member_id, status")
      .eq("supplier_id", supplier.id),
    supabase.from("invoice_periods").select("year, month").eq("is_open", true),
  ]);

  type SubRow = {
    period_year: number;
    period_month: number;
    supplier_member_id: string;
    status: string;
  };
  const monthsSet = new Map<string, { year: number; month: number }>();
  const submittedByMonth = new Map<string, Set<string>>();
  ((subAll as SubRow[]) ?? []).forEach((s) => {
    const k = `${s.period_year}-${s.period_month}`;
    monthsSet.set(k, { year: s.period_year, month: s.period_month });
    // "Submitted" = handed in and not sent back (draft/returned still need action).
    if (s.status !== "draft" && s.status !== "returned") {
      const set = submittedByMonth.get(k) ?? new Set<string>();
      set.add(s.supplier_member_id);
      submittedByMonth.set(k, set);
    }
  });
  ((openP as { year: number; month: number }[]) ?? []).forEach((p) => {
    monthsSet.set(`${p.year}-${p.month}`, { year: p.year, month: p.month });
  });
  const monthStats = [...monthsSet.values()]
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(0, 6)
    .map(({ year, month }) => {
      const submitted = submittedByMonth.get(`${year}-${month}`)?.size ?? 0;
      const expected = activeCount;
      return {
        year,
        month,
        submitted: Math.min(submitted, expected),
        expected,
        outstanding: Math.max(0, expected - submitted),
      };
    });

  return (
    <>
      <PageHeader
        title="Roster"
        description="Your people and their standing details. HR keeps this up to date — contact them to make changes."
        action={
          members.length > 0 ? (
            <div className="text-sm text-ink-500">
              <span className="font-semibold text-ink-900 tnum">{members.length}</span>{" "}
              {members.length === 1 ? "person" : "people"}
              {activeCount < members.length && (
                <>
                  {" · "}
                  <span className="tnum">{activeCount}</span> active
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {monthStats.length > 0 && activeCount > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Time submissions by month"
            description="How many of your active people have submitted, and how many are still outstanding."
          />
          <CardBody className="space-y-4">
            {monthStats.map((s) => {
              const pct = s.expected ? Math.round((s.submitted / s.expected) * 100) : 0;
              return (
                <div key={`${s.year}-${s.month}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-ink-900">
                      {periodLabel(s.year, s.month)}
                    </span>
                    <span className="text-ink-600 tnum">
                      {s.submitted} of {s.expected} submitted
                      {s.outstanding > 0 && (
                        <span className="font-medium text-gold-700">
                          {" · "}
                          {s.outstanding} outstanding
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      {members.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No roster members yet"
              description="Ask your HR team to add your people to the roster."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => {
            const roleLabel = m.role
              ? ROSTER_ROLE_LABELS[m.role as RosterRole] ?? m.role
              : null;
            const pay = payLines(m);
            return (
              <Card key={m.id}>
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-900">{m.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        {roleLabel && (
                          <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                            {roleLabel}
                          </Badge>
                        )}
                        <span className="font-mono text-xs text-ink-400 tnum">
                          ID {m.code}
                        </span>
                      </div>
                    </div>
                    <ActiveBadge active={m.active} />
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Pay
                    </div>
                    {pay.length ? (
                      <ul className="mt-1 space-y-0.5 text-sm text-ink-700 tnum">
                        {pay.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-sm text-ink-400">Not set</div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Bank details
                    </div>
                    {m.payment_details ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-700">
                        {m.payment_details}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink-400">Not provided</p>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
