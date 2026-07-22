import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CheckEditor } from "@/components/dept/CheckEditor";
import { deleteCheck } from "@/actions/dept-checks";
import type { Centre } from "@/lib/constants";
import type { DeptHeadCheck, DeptHeadCheckItem, TeamMember } from "@/lib/types";

export const metadata = { title: "Edit Cross-check" };

export default async function EditCheck({
  params,
}: {
  params: { id: string };
}) {
  const { profile } = await requireRole("department_head");
  const supabase = createClient();

  const { data: checkRow } = await supabase
    .from("dept_head_checks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!checkRow) notFound();
  const check = checkRow as DeptHeadCheck;

  const [{ data: itemRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("dept_head_check_items")
      .select("*")
      .eq("check_id", check.id)
      .order("sort_order"),
    supabase
      .from("team_members")
      .select("id, name, employee_id")
      .eq("active", true)
      .order("name"),
  ]);

  const items = (itemRows as DeptHeadCheckItem[]) ?? [];
  const members =
    (memberRows as Pick<TeamMember, "id" | "name" | "employee_id">[]) ?? [];

  return (
    <>
      <div className="mb-4">
        <Link href="/dept/checks" className="text-sm text-brand-600 hover:underline">
          ← Cross-checks
        </Link>
      </div>
      <PageHeader title="Edit cross-check" />

      <CheckEditor
        teamMembers={members}
        defaultBusiness={(profile.business as Centre) ?? "MathVision"}
        initial={{
          id: check.id,
          teamMemberId: check.team_member_id,
          year: check.period_year,
          month: check.period_month,
          business: check.business,
          notes: check.notes ?? "",
          items: items.map((i) => ({
            task: i.task,
            note: i.note,
            sessions: i.sessions,
            hours: i.hours,
            sort_order: i.sort_order,
          })),
        }}
      />

      <Card className="mt-8 border-red-100">
        <CardHeader title="Delete" description="Remove this cross-check." />
        <CardBody>
          <form action={deleteCheck} className="flex items-center justify-between gap-3">
            <input type="hidden" name="id" value={check.id} />
            <span className="text-sm text-ink-600">This cannot be undone.</span>
            <SubmitButton variant="danger" size="sm" confirm="Delete this cross-check?">
              Delete cross-check
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
