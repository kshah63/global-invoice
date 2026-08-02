import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/Flash";
import {
  PeopleDirectory,
  type IndividualEntry,
  type SupplierEntry,
} from "@/components/hr/PeopleDirectory";
import type { Profile, TeamMember, TeamMemberRate } from "@/lib/types";

export const metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();
  const [{ data }, { data: heads }] = await Promise.all([
    supabase
      .from("team_members")
      .select("*")
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "department_head")
      .order("full_name"),
  ]);
  const members = (data as TeamMember[]) ?? [];
  const individuals = members.filter((m) => m.member_type !== "supplier");
  const suppliers = members.filter((m) => m.member_type === "supplier");
  const deptHeads = (heads as Profile[]) ?? [];

  // Rates for individuals (for the Pay column).
  const individualIds = individuals.map((m) => m.id);
  const { data: rateData } = individualIds.length
    ? await supabase
        .from("team_member_rates")
        .select("*")
        .in("team_member_id", individualIds)
        .order("sort_order")
    : { data: [] as TeamMemberRate[] };
  const ratesByMember = new Map<string, TeamMemberRate[]>();
  ((rateData as TeamMemberRate[]) ?? []).forEach((r) => {
    const arr = ratesByMember.get(r.team_member_id) ?? [];
    arr.push(r);
    ratesByMember.set(r.team_member_id, arr);
  });

  // Roster size per supplier.
  const supplierIds = suppliers.map((s) => s.id);
  const { data: rosterRows } = supplierIds.length
    ? await supabase
        .from("supplier_members")
        .select("supplier_id")
        .in("supplier_id", supplierIds)
    : { data: [] as { supplier_id: string }[] };
  const rosterCount = new Map<string, number>();
  ((rosterRows as { supplier_id: string }[]) ?? []).forEach((r) => {
    rosterCount.set(r.supplier_id, (rosterCount.get(r.supplier_id) ?? 0) + 1);
  });

  const individualEntries: IndividualEntry[] = individuals.map((m) => ({
    member: m,
    rates: ratesByMember.get(m.id) ?? [],
  }));
  const supplierEntries: SupplierEntry[] = suppliers.map((m) => ({
    member: m,
    rosterCount: rosterCount.get(m.id) ?? 0,
  }));

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="People"
        description="Individuals, suppliers and department heads."
        action={
          <div className="flex flex-wrap gap-2">
            <Button href="/hr/team-members/new">Add individual</Button>
            <Button href="/hr/suppliers/new" variant="neutral">
              Add supplier
            </Button>
            <Button href="/hr/department-heads/new" variant="neutral">
              Add department head
            </Button>
          </div>
        }
      />

      <PeopleDirectory
        individuals={individualEntries}
        suppliers={supplierEntries}
        deptHeads={deptHeads}
      />
    </>
  );
}
