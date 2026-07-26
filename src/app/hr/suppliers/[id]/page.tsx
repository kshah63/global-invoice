import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { SupplierDetailsForm } from "@/components/hr/SupplierDetailsForm";
import { RosterEditor } from "@/components/hr/RosterEditor";
import { MemberLoginsCard } from "@/components/hr/MemberLoginsCard";
import { SupplierPasswordCard } from "@/components/hr/SupplierPasswordCard";
import { deleteSupplier } from "@/actions/suppliers";
import type { RateUnit, TaskType } from "@/lib/constants";
import type { SupplierMember, SupplierMemberRate, TeamMember } from "@/lib/types";

export const metadata = { title: "Edit Supplier" };

export default async function EditSupplier({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: row } = await supabase
    .from("team_members")
    .select("*")
    .eq("id", params.id)
    .eq("member_type", "supplier")
    .maybeSingle();
  if (!row) notFound();
  const supplier = row as TeamMember;

  const { data: memberRows } = await supabase
    .from("supplier_members")
    .select("*")
    .eq("supplier_id", supplier.id)
    .order("sort_order");

  const memberList = (memberRows as SupplierMember[]) ?? [];
  const memberIds = memberList.map((m) => m.id);

  const { data: rateRows } = memberIds.length
    ? await supabase
        .from("supplier_member_rates")
        .select("*")
        .in("supplier_member_id", memberIds)
        .order("sort_order")
    : { data: [] as SupplierMemberRate[] };
  const ratesByMember = new Map<string, SupplierMemberRate[]>();
  ((rateRows as SupplierMemberRate[]) ?? []).forEach((r) => {
    const arr = ratesByMember.get(r.supplier_member_id) ?? [];
    arr.push(r);
    ratesByMember.set(r.supplier_member_id, arr);
  });

  const people = memberList.map((m) => {
    const rates = (ratesByMember.get(m.id) ?? []).map((r) => ({
      id: r.id as string | null,
      descriptor: r.descriptor as string | null,
      unit: r.unit as RateUnit,
      amount: Number(r.amount),
      task: (r.task ?? null) as TaskType | null,
    }));
    // Fallback for a legacy rate member whose single rate hasn't been migrated
    // into a rate row yet.
    if (m.pay_type === "rate" && rates.length === 0 && Number(m.rate_amount) > 0) {
      rates.push({
        id: null,
        descriptor: m.rate_descriptor,
        unit: m.rate_unit as RateUnit,
        amount: Number(m.rate_amount),
        task: (m.rate_task ?? null) as TaskType | null,
      });
    }
    return {
      id: m.id,
      name: m.name,
      code: m.code,
      pay_type: m.pay_type,
      monthly_salary: m.monthly_salary != null ? Number(m.monthly_salary) : 0,
      subjects: m.subjects ?? [],
      rates,
    };
  });

  const loginRows = memberList.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    email: m.email,
    hasLogin: !!m.profile_id,
  }));

  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← People
        </Link>
      </div>
      <PageHeader title={supplier.name} description={`Supplier · code ${supplier.supplier_code}`} />
      <Flash ok={searchParams.ok} error={searchParams.error} />

      <div className="space-y-8">
        <SupplierDetailsForm
          mode="edit"
          id={supplier.id}
          initial={{
            name: supplier.name,
            email: supplier.email ?? "",
            supplier_code: supplier.supplier_code ?? "",
            currency: supplier.currency,
            payment_details: supplier.payment_details,
          }}
        />

        <RosterEditor
          supplierId={supplier.id}
          currency={supplier.currency}
          initialPeople={people}
        />

        <MemberLoginsCard members={loginRows} />

        <SupplierPasswordCard supplierId={supplier.id} />

        <Card className="border-red-100">
          <CardHeader
            title="Danger zone"
            description="Removing a supplier deletes its login, roster and all its invoices."
          />
          <CardBody>
            <form action={deleteSupplier} className="flex items-center justify-between gap-3">
              <input type="hidden" name="id" value={supplier.id} />
              <span className="text-sm text-ink-600">This cannot be undone.</span>
              <SubmitButton
                variant="danger"
                size="sm"
                confirm={`Permanently delete ${supplier.name}, its login and all its invoices?`}
              >
                Delete supplier
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
