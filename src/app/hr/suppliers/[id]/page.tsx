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
    .select("*, rates:supplier_member_rates(*)")
    .eq("supplier_id", supplier.id)
    .order("sort_order");

  const people = ((memberRows as (SupplierMember & { rates: SupplierMemberRate[] })[]) ?? []).map(
    (m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      rates: (m.rates ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({
          descriptor: r.descriptor,
          unit: r.unit as RateUnit,
          amount: Number(r.amount),
          task: (r.task ?? null) as TaskType | null,
        })),
    })
  );

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
            email: supplier.email,
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
