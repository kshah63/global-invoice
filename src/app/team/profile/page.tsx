import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { ProfilePrefsForm } from "@/components/team/ProfilePrefsForm";
import { CURRENCY_META, RATE_UNIT_LABELS, TASK_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TeamMember, TeamMemberRate } from "@/lib/types";

export const metadata = { title: "Profile" };

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink-800">{value || "—"}</dd>
    </div>
  );
}

export default async function TeamProfile({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();

  const { data: tmRow } = await supabase
    .from("team_members")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!tmRow) {
    return (
      <>
        <PageHeader title="Profile" />
        <Alert tone="warning">Your login isn&apos;t linked to a team member record yet.</Alert>
      </>
    );
  }
  const tm = tmRow as TeamMember;

  const { data: rateRows } = await supabase
    .from("team_member_rates")
    .select("*")
    .eq("team_member_id", tm.id)
    .order("sort_order");
  const rates = (rateRows as TeamMemberRate[]) ?? [];

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="My Profile"
        description="Manage what appears on your invoices. Other details are maintained by HR."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoice preferences" description="You can edit these." />
          <CardBody>
            <ProfilePrefsForm
              hrName={tm.name}
              useHrName={tm.use_hr_name}
              invoiceDisplayName={tm.invoice_display_name ?? ""}
              shipToAddress={tm.ship_to_address ?? ""}
            />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Your details"
              description="Maintained by HR. Contact them for changes."
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <Detail label="Name" value={tm.name} />
                <Detail label="Employee ID" value={tm.employee_id} />
                <Detail label="Email" value={tm.email} />
                <Detail label="WhatsApp" value={tm.whatsapp_number} />
                <Detail
                  label="Currency"
                  value={`${tm.currency} · ${CURRENCY_META[tm.currency].label}`}
                />
                <Detail label="Work location" value={tm.work_location} />
                <Detail label="Nationality" value={tm.nationality} />
                <Detail label="Head of department" value={tm.head_of_department} />
                <Detail label="Date joined" value={formatDate(tm.date_joined)} />
                <Detail
                  label="Fixed salary"
                  value={
                    tm.fixed_salary != null
                      ? formatCurrency(tm.fixed_salary, tm.currency)
                      : "—"
                  }
                />
                <Detail
                  label="Subjects"
                  value={tm.subjects?.length ? tm.subjects.join(", ") : "—"}
                />
                <Detail label="Payment details" value={tm.payment_details} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your rates" description="Used in your invoice line items." />
            <CardBody>
              {rates.length ? (
                <ul className="divide-y divide-ink-100">
                  {rates.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <div className="font-medium text-ink-900">{r.descriptor}</div>
                        {r.task && (
                          <div className="text-xs text-ink-400">{TASK_LABELS[r.task]}</div>
                        )}
                      </div>
                      <div className="tnum text-ink-700">
                        {formatCurrency(Number(r.amount), tm.currency)}{" "}
                        <span className="text-xs text-ink-400">
                          {RATE_UNIT_LABELS[r.unit]}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">
                  No rates configured yet.{" "}
                  {tm.fixed_salary != null
                    ? "You have a fixed salary set."
                    : "Ask HR to add your rates."}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
