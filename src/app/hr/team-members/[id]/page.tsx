import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { TeamMemberForm } from "@/components/hr/TeamMemberForm";
import { deleteTeamMember } from "@/actions/team-members";
import type { TeamMember, TeamMemberRate } from "@/lib/types";

export const metadata = { title: "Edit Team Member" };

export default async function EditTeamMember({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: tmRow } = await supabase
    .from("team_members")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!tmRow) notFound();
  const tm = tmRow as TeamMember;

  const { data: rateRows } = await supabase
    .from("team_member_rates")
    .select("*")
    .eq("team_member_id", tm.id)
    .order("sort_order");
  const rates = (rateRows as TeamMemberRate[]) ?? [];

  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← Team members
        </Link>
      </div>
      <PageHeader
        title={tm.name}
        description={`Employee ID ${tm.employee_id}`}
      />
      <Flash ok={searchParams.ok} error={searchParams.error} />

      <TeamMemberForm
        mode="edit"
        id={tm.id}
        initial={{
          name: tm.name,
          email: tm.email,
          employee_id: tm.employee_id,
          whatsapp_number: tm.whatsapp_number,
          date_joined: tm.date_joined,
          nationality: tm.nationality,
          work_location: tm.work_location,
          head_of_department: tm.head_of_department,
          payment_details: tm.payment_details,
          currency: tm.currency,
          fixed_salary: tm.fixed_salary,
          subjects: tm.subjects,
          rates: rates.map((r) => ({
            descriptor: r.descriptor,
            unit: r.unit,
            amount: Number(r.amount),
            task: r.task,
            sort_order: r.sort_order,
          })),
        }}
      />

      <Card className="mt-8 border-red-100">
        <CardHeader
          title="Danger zone"
          description="Removing a team member deletes their login and all their invoices."
        />
        <CardBody>
          <form action={deleteTeamMember} className="flex items-center justify-between gap-3">
            <input type="hidden" name="id" value={tm.id} />
            <span className="text-sm text-ink-600">
              This action cannot be undone.
            </span>
            <SubmitButton
              variant="danger"
              size="sm"
              confirm={`Permanently delete ${tm.name}, their login and all their invoices?`}
            >
              Delete team member
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
