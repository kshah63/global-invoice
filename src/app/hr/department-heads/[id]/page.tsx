import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { DeptHeadEditForm } from "@/components/hr/DeptHeadEditForm";
import { ResetPasswordCard } from "@/components/hr/ResetPasswordCard";
import { deleteDepartmentHead } from "@/actions/settings";
import { CENTRES, type Centre } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Edit Department Head" };

export default async function EditDeptHead({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: row } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .eq("role", "department_head")
    .maybeSingle();
  if (!row) notFound();
  const dh = row as Profile;

  // Hide the ID-only placeholder email so the field reads as empty.
  const email = (dh.email ?? "").endsWith("@dept.invoicing.local") ? "" : dh.email ?? "";

  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← People
        </Link>
      </div>
      <PageHeader
        title={dh.full_name ?? "Department head"}
        description={dh.login_code ? `Login ID ${dh.login_code}` : undefined}
      />
      <Flash ok={searchParams.ok} error={searchParams.error} />

      <Card>
        <CardBody>
          <DeptHeadEditForm
            id={dh.id}
            initial={{
              name: dh.full_name ?? "",
              email,
              loginCode: dh.login_code ?? "",
              business: (dh.business ?? CENTRES[0]) as Centre,
            }}
          />
        </CardBody>
      </Card>

      <ResetPasswordCard deptHeadId={dh.id} />

      <Card className="mt-8 border-red-100">
        <CardHeader
          title="Danger zone"
          description="Removing a department head deletes their login and their cross-checks."
        />
        <CardBody>
          <form action={deleteDepartmentHead} className="flex items-center justify-between gap-3">
            <input type="hidden" name="profile_id" value={dh.id} />
            <span className="text-sm text-ink-600">This action cannot be undone.</span>
            <SubmitButton
              variant="danger"
              size="sm"
              confirm={`Permanently delete ${dh.full_name ?? "this department head"}?`}
            >
              Delete department head
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
