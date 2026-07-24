import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hrActionsFor } from "@/lib/invoice";
import { getFxRate } from "@/lib/fx";
import { TASK_LABELS, periodLabel, type Currency, type TaskType } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PayoutFxCard } from "@/components/hr/PayoutFxCard";
import {
  MemberSubmissionsPanel,
  type MemberSubmissionRow,
} from "@/components/invoice/MemberSubmissionsPanel";
import { hrInvoiceTransition } from "@/actions/invoices";
import type {
  DeptHeadCheck,
  DeptHeadCheckItem,
  Invoice,
  InvoiceLineItem,
  Profile,
  SupplierMemberInvoice,
  TeamMember,
} from "@/lib/types";

const TONE_TO_VARIANT: Record<string, "primary" | "gold" | "neutral" | "danger"> = {
  primary: "primary",
  gold: "gold",
  neutral: "neutral",
  danger: "danger",
};

type CheckWithItems = DeptHeadCheck & { items: DeptHeadCheckItem[] };

export default async function HrInvoiceDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await requireRole("hr");
  const supabase = createClient();

  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!invoiceRow) notFound();
  const invoice = invoiceRow as Invoice;

  const [{ data: itemsRows }, { data: tmRow }, { data: checkRows }] =
    await Promise.all([
      supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("sort_order"),
      supabase
        .from("team_members")
        .select("*")
        .eq("id", invoice.team_member_id)
        .maybeSingle(),
      supabase
        .from("dept_head_checks")
        .select("*, items:dept_head_check_items(*)")
        .eq("team_member_id", invoice.team_member_id)
        .eq("period_year", invoice.period_year)
        .eq("period_month", invoice.period_month),
    ]);

  const items = (itemsRows as InvoiceLineItem[]) ?? [];
  const tm = tmRow as TeamMember | null;
  const checks = (checkRows as CheckWithItems[]) ?? [];

  // For a supplier's consolidated invoice, HR can also see (and step into) the
  // member submissions + their payout FX.
  let memberSubs: MemberSubmissionRow[] = [];
  if (tm?.member_type === "supplier") {
    const { data: subRows } = await supabase
      .from("supplier_member_invoices")
      .select("*, member:supplier_members(name)")
      .eq("supplier_id", invoice.team_member_id)
      .eq("period_year", invoice.period_year)
      .eq("period_month", invoice.period_month);
    const subList =
      (subRows as (SupplierMemberInvoice & { member: { name: string } | null })[]) ?? [];
    const baseCcy = invoice.currency as Currency;
    const payCcys = Array.from(
      new Set(
        subList
          .map((s) => s.payment_currency)
          .filter((c): c is Currency => !!c && c !== baseCcy)
      )
    );
    const rateMap = new Map<Currency, number | null>();
    await Promise.all(payCcys.map(async (c) => rateMap.set(c, await getFxRate(baseCcy, c))));
    memberSubs = subList
      .map((s) => ({
        id: s.id,
        memberName: s.member?.name ?? s.display_name,
        status: s.status,
        total: Number(s.total),
        currency: s.currency as Currency,
        returnNote: s.return_note,
        paymentCurrency: (s.payment_currency ?? null) as Currency | null,
        indicativeRate:
          s.payment_currency && s.payment_currency !== s.currency
            ? rateMap.get(s.payment_currency as Currency) ?? null
            : null,
        fxRate: s.fx_rate != null ? Number(s.fx_rate) : null,
        fxRateDate: s.fx_rate_date,
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }

  // Author names for the checks
  const authorIds = Array.from(new Set(checks.map((c) => c.created_by)));
  const authorName = new Map<string, string>();
  if (authorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);
    (profs as Pick<Profile, "id" | "full_name">[] | null)?.forEach((p) =>
      authorName.set(p.id, p.full_name ?? "Department Head")
    );
  }

  // Comparison by task: invoice vs department-head checks
  const agg = (
    rows: { task: TaskType; sessions: number; hours: number }[]
  ) => {
    const m = new Map<TaskType, { sessions: number; hours: number }>();
    rows.forEach((r) => {
      const cur = m.get(r.task) ?? { sessions: 0, hours: 0 };
      cur.sessions += Number(r.sessions) || 0;
      cur.hours += Number(r.hours) || 0;
      m.set(r.task, cur);
    });
    return m;
  };
  const invoiceAgg = agg(items.map((i) => ({ task: i.task, sessions: i.sessions, hours: i.hours })));
  const checkAgg = agg(
    checks.flatMap((c) => c.items).map((i) => ({ task: i.task, sessions: i.sessions, hours: i.hours }))
  );
  const compareTasks = Array.from(
    new Set<TaskType>([...invoiceAgg.keys(), ...checkAgg.keys()])
  );

  const actions = hrActionsFor(invoice.status);

  // Payout FX (individuals paid in another currency).
  const rateCurrency = invoice.currency as Currency;
  const paymentCurrency = (tm?.payment_currency ?? null) as Currency | null;
  const showFx = !!paymentCurrency && paymentCurrency !== rateCurrency;
  const fxRate = showFx ? await getFxRate(rateCurrency, paymentCurrency!) : null;

  return (
    <>
      <div className="mb-4">
        <Link href="/hr/invoices" className="text-sm text-brand-600 hover:underline">
          ← Invoices
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {tm?.name ?? invoice.display_name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {periodLabel(invoice.period_year, invoice.period_month)} ·{" "}
            <span className="font-mono tnum">{invoice.invoice_number}</span>
          </p>
        </div>
        <StatusPill status={invoice.status} />
      </div>

      <Flash ok={searchParams.ok} error={searchParams.error} />

      {/* HR actions */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink-600">Actions:</span>
          {actions.length === 0 ? (
            <span className="text-sm text-ink-400">
              {invoice.status === "draft"
                ? "Waiting for the team member to submit."
                : "No actions available."}
            </span>
          ) : (
            actions.map((a) => (
              <form action={hrInvoiceTransition} key={a.action}>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input type="hidden" name="action" value={a.action} />
                <SubmitButton
                  variant={TONE_TO_VARIANT[a.tone]}
                  size="sm"
                  confirm={
                    a.action === "lock"
                      ? "Lock this invoice? The team member will no longer be able to edit it."
                      : a.action === "mark_paid"
                        ? "Mark this invoice as paid?"
                        : undefined
                  }
                >
                  {a.label}
                </SubmitButton>
              </form>
            ))
          )}
          <Button
            href={`/print/invoice/${invoice.id}`}
            variant="ghost"
            size="sm"
            className="ml-auto"
          >
            Download / Print
          </Button>
        </CardBody>
      </Card>

      {/* Department head cross-check */}
      {checks.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Department head cross-check"
            description="Compare the invoice against sessions/hours reported by department heads."
          />
          <CardBody className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="py-2 pr-3 font-semibold">Task</th>
                    <th className="py-2 pr-3 text-right font-semibold">Invoice sessions</th>
                    <th className="py-2 pr-3 text-right font-semibold">Check sessions</th>
                    <th className="py-2 pr-3 text-right font-semibold">Invoice hours</th>
                    <th className="py-2 text-right font-semibold">Check hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {compareTasks.map((t) => {
                    const inv = invoiceAgg.get(t) ?? { sessions: 0, hours: 0 };
                    const chk = checkAgg.get(t) ?? { sessions: 0, hours: 0 };
                    const sessMismatch = Math.abs(inv.sessions - chk.sessions) > 0.001;
                    const hoursMismatch = Math.abs(inv.hours - chk.hours) > 0.001;
                    return (
                      <tr key={t}>
                        <td className="py-2 pr-3">{TASK_LABELS[t]}</td>
                        <td className="py-2 pr-3 text-right tnum">
                          {formatNumber(inv.sessions)}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right tnum ${sessMismatch ? "font-semibold text-gold-700" : ""}`}
                        >
                          {formatNumber(chk.sessions)}
                        </td>
                        <td className="py-2 pr-3 text-right tnum">
                          {formatNumber(inv.hours)}
                        </td>
                        <td
                          className={`py-2 text-right tnum ${hoursMismatch ? "font-semibold text-gold-700" : ""}`}
                        >
                          {formatNumber(chk.hours)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 text-xs text-ink-500">
              {checks.map((c) => (
                <div key={c.id}>
                  Submitted by{" "}
                  <span className="font-medium text-ink-700">
                    {authorName.get(c.created_by) ?? "Department Head"}
                  </span>{" "}
                  · {c.business}
                  {c.notes ? ` · “${c.notes}”` : ""}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {memberSubs.length > 0 && (
        <MemberSubmissionsPanel submissions={memberSubs} canManageFx />
      )}

      {showFx && paymentCurrency && (
        <PayoutFxCard
          invoiceId={invoice.id}
          total={invoice.total}
          rateCurrency={rateCurrency}
          paymentCurrency={paymentCurrency}
          indicativeRate={fxRate}
          initialRate={invoice.fx_rate}
          initialDate={invoice.fx_rate_date}
        />
      )}

      <InvoiceDocument
        invoice={invoice}
        items={items}
        teamMember={tm}
        paymentCurrency={paymentCurrency}
        fxRate={fxRate}
      />
    </>
  );
}
