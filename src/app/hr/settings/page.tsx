import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { DeptHeadForm } from "@/components/hr/DeptHeadForm";
import { updateCompany, deleteDepartmentHead } from "@/actions/settings";
import type { CompanySettings, Profile } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const [{ data: company }, { data: heads }] = await Promise.all([
    supabase.from("company_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "department_head")
      .order("full_name"),
  ]);
  const c = company as CompanySettings | null;
  const deptHeads = (heads as Profile[]) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Settings"
        description="Company details and department head accounts."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="MathVision company address"
            description="Appears as the 'billed to' details on every invoice."
          />
          <CardBody>
            <form action={updateCompany} className="space-y-4">
              <Field label="Company name" required>
                <Input
                  name="company_name"
                  defaultValue={c?.company_name ?? "MathVision"}
                  required
                />
              </Field>
              <Field label="Address">
                <Textarea name="address" defaultValue={c?.address ?? ""} rows={3} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={c?.email ?? ""} />
                </Field>
                <Field label="Phone">
                  <Input name="phone" defaultValue={c?.phone ?? ""} />
                </Field>
              </div>
              <Field label="Registration number">
                <Input name="registration_no" defaultValue={c?.registration_no ?? ""} />
              </Field>
              <SubmitButton>Save company details</SubmitButton>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Department heads"
            description="They can submit session/hour cross-checks for HR to review."
          />
          <CardBody className="space-y-6">
            {deptHeads.length > 0 && (
              <ul className="divide-y divide-ink-100">
                {deptHeads.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <div className="font-medium text-ink-900">
                        {h.full_name ?? h.email}
                      </div>
                      <div className="text-xs text-ink-400">{h.email}</div>
                      {h.login_code && (
                        <div className="text-xs text-ink-400">
                          Login ID: {h.login_code}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {h.business && (
                        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                          {h.business}
                        </Badge>
                      )}
                      <form action={deleteDepartmentHead}>
                        <input type="hidden" name="profile_id" value={h.id} />
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          confirm={`Remove ${h.full_name ?? h.email}?`}
                        >
                          Remove
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-ink-100 pt-5">
              <DeptHeadForm />
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
