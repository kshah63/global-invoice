import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Flash } from "@/components/Flash";
import { updateCompany } from "@/actions/settings";
import type { CompanySettings } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: company } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const c = company as CompanySettings | null;

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Settings"
        description="Company details shown on invoices."
      />

      <div className="max-w-xl">
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
      </div>
    </>
  );
}
