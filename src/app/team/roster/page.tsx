import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import {
  ROSTER_ROLE_LABELS,
  RATE_UNIT_LABELS,
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

  return (
    <>
      <PageHeader
        title="Roster"
        description="Your people and their standing details. HR keeps this up to date — contact them to make changes."
      />

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
