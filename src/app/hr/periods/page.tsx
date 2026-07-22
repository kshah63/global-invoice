import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EmptyState } from "@/components/ui/Feedback";
import { Flash } from "@/components/Flash";
import { openPeriod, setPeriodOpen } from "@/actions/periods";
import { MONTH_NAMES, periodLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { InvoicePeriod } from "@/lib/types";

export const metadata = { title: "Periods" };

export default async function PeriodsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const now = new Date();
  const supabase = createClient();
  const { data } = await supabase
    .from("invoice_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  const periods = (data as InvoicePeriod[]) ?? [];

  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) years.push(y);

  return (
    <>
      <Flash ok={searchParams.ok} error={searchParams.error} />
      <PageHeader
        title="Invoice Periods"
        description="Open a month so team members can create invoices for it."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Open a month" />
          <CardBody>
            <form action={openPeriod} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Month">
                  <Select name="month" defaultValue={now.getMonth() + 1}>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Year">
                  <Select name="year" defaultValue={now.getFullYear()}>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Note (optional)">
                <Textarea name="note" placeholder="Anything to record about this period" />
              </Field>
              <SubmitButton>Open period</SubmitButton>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="All periods" />
          <CardBody className="p-0">
            {periods.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No periods yet"
                  description="Open your first month to allow invoicing."
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {periods.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-900">
                          {periodLabel(p.year, p.month)}
                        </span>
                        {p.is_open ? (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Open
                          </Badge>
                        ) : (
                          <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
                            Closed
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-400">
                        {p.opened_at ? `Opened ${formatDateTime(p.opened_at)}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </div>
                    </div>
                    <form action={setPeriodOpen}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_open" value={String(!p.is_open)} />
                      <SubmitButton variant="neutral" size="sm">
                        {p.is_open ? "Close" : "Reopen"}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
