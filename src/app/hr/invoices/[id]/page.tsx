import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hrActionsFor } from "@/lib/invoice";
import { TASK_LABELS, periodLabel, type Currency, type TaskType } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { InvoiceMessageCard } from "@/components/hr/InvoiceMessageCard";
import {
  MemberSubmissionsPanel,
  type MemberSubmissionRow,
} from "@/components/invoice/MemberSubmissionsPanel";
import {
  BundleIndividualsCard,
  type BundledRow,
  type EligibleRow,
} from "@/components/hr/BundleIndividualsCard";
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
      .select(
        "*, member:supplier_members(name), items:supplier_member_invoice_items(id, task, rate_descriptor, sessions, hours, line_total, sort_order)"
      )
      .eq("supplier_id", invoice.team_member_id)
      .eq("period_year", invoice.period_year)
      .eq("period_month", invoice.period_month);
    type SubItem = {
      id: string;
      task: TaskType;
      rate_descriptor: string | null;
      sessions: number;
      hours: number;
      line_total: number;
      sort_order: number;
    };
    const subList =
      (subRows as (SupplierMemberInvoice & {
        member: { name: string } | null;
        items: SubItem[];
      })[]) ?? [];
    memberSubs = subList
      .map((s) => ({
        id: s.id,
        memberName: s.member?.name ?? s.display_name,
        status: s.status,
        total: Number(s.total),
        currency: s.currency as Currency,
        returnNote: s.return_note,
        items: [...(s.items ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((it) => ({
            id: it.id,
            label: it.rate_descriptor || TASK_LABELS[it.task] || String(it.task),
            sessions: Number(it.sessions),
            hours: Number(it.hours),
            total: Number(it.line_total),
          })),
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }

  // Bundling: individuals paid via this supplier invoice, + who's eligible to add.
  let bundledRows: BundledRow[] = [];
  let eligibleRows: EligibleRow[] = [];
  let supplierRateSet = invoice.currency === "SGD";
  let supRate = 1;
  if (tm?.member_type === "supplier") {
    if (invoice.currency !== "SGD") {
      const { data: fx } = await supabase
        .from("report_fx_rates")
        .select("units_per_sgd")
        .eq("year", invoice.period_year)
        .eq("month", invoice.period_month)
        .eq("currency", invoice.currency)
        .maybeSingle();
      if (fx) {
        supplierRateSet = true;
        supRate = Number((fx as { units_per_sgd: number }).units_per_sgd);
      }
    }
    const [{ data: bRows }, { data: eRows }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, total, bundled_sgd_amount, bundled_rate, team_members(name)")
        .eq("bundled_into_invoice_id", invoice.id),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, status, team_members(name, member_type)")
        .eq("period_year", invoice.period_year)
        .eq("period_month", invoice.period_month)
        .is("bundled_into_invoice_id", null)
        .in("status", ["approved", "locked", "paid"]),
    ]);
    type BRow = {
      id: string;
      invoice_number: string;
      total: number;
      bundled_sgd_amount: number | null;
      bundled_rate: number | null;
      team_members: { name: string } | null;
    };
    bundledRows = ((bRows as unknown as BRow[]) ?? []).map((r) => {
      const sgd = Number(r.bundled_sgd_amount ?? 0);
      const rate = Number(r.bundled_rate ?? supRate);
      const currentSgd = Number(r.total); // individuals are in SGD
      const stale =
        Math.abs(currentSgd - sgd) > 0.005 ||
        (supplierRateSet && Math.abs(rate - supRate) > 0.0000005);
      return {
        individualInvoiceId: r.id,
        name: r.team_members?.name ?? "Individual",
        invoiceNumber: r.invoice_number,
        sgdAmount: sgd,
        rate,
        converted: Math.round(sgd * rate * 100) / 100,
        stale,
      };
    });
    type ERow = {
      id: string;
      invoice_number: string;
      total: number;
      team_members: { name: string; member_type: string } | null;
    };
    eligibleRows = ((eRows as unknown as ERow[]) ?? [])
      .filter((r) => r.team_members?.member_type !== "supplier")
      .map((r) => ({
        invoiceId: r.id,
        name: r.team_members?.name ?? "Individual",
        invoiceNumber: r.invoice_number,
        sgdTotal: Number(r.total),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/hr/invoices?year=${invoice.period_year}&month=${invoice.period_month}`}
          className="text-sm text-brand-600 hover:underline"
        >
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
                    a.action === "approve"
                      ? "Approve this invoice? It becomes final and the team member can no longer edit it. You can Reopen it if a change is needed."
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

      {tm?.member_type === "supplier" && (
        <BundleIndividualsCard
          supplierInvoiceId={invoice.id}
          supplierCurrency={invoice.currency}
          rateSet={supplierRateSet}
          periodLabel={periodLabel(invoice.period_year, invoice.period_month)}
          paid={invoice.status === "paid"}
          bundled={bundledRows}
          eligible={eligibleRows}
        />
      )}

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

      {tm?.profile_id && (
        <InvoiceMessageCard
          participantProfileId={tm.profile_id}
          participantName={tm.name}
          invoiceNumber={invoice.invoice_number}
        />
      )}

      {memberSubs.length > 0 && <MemberSubmissionsPanel submissions={memberSubs} />}

      <InvoiceDocument invoice={invoice} items={items} teamMember={tm} />
    </>
  );
}
