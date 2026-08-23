import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { PrintButton } from "@/components/PrintButton";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { HistoryControls } from "@/components/hr/HistoryControls";
import {
  PayrollMatrix,
  type MatrixCol,
  type MatrixRow,
  type MatrixCell,
  type MatrixSubRow,
} from "@/components/hr/PayrollMatrix";
import { round2 } from "@/lib/invoice";
import { MONTH_NAMES, type Currency } from "@/lib/constants";

export const metadata = { title: "Payroll by month" };

const MAX_COLS = 18;

type InvoiceLite = {
  id: string;
  team_member_id: string;
  period_year: number;
  period_month: number;
  total: number;
  currency: Currency;
  bundled_into_invoice_id: string | null;
  bundled_sgd_amount: number | null;
  bundled_rate: number | null;
};
type MemberLite = {
  id: string;
  name: string;
  employee_id: string | null;
  supplier_code: string | null;
  member_type: string;
  currency: Currency;
};
type LineLite = {
  invoice_id: string;
  supplier_member_id: string | null;
  worked_by_name: string | null;
  line_total: number;
  source_individual_invoice_id: string | null;
};

const OTHER = "__other__";

export default async function MonthlyReport({
  searchParams,
}: {
  searchParams: {
    fromYear?: string;
    fromMonth?: string;
    toYear?: string;
    toMonth?: string;
    sgd?: string;
  };
}) {
  await requireRole("hr");
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  const toY = Number(searchParams.toYear) || curY;
  const toM = Number(searchParams.toMonth) || curM;
  let fromY: number;
  let fromM: number;
  if (searchParams.fromYear && searchParams.fromMonth) {
    fromY = Number(searchParams.fromYear);
    fromM = Number(searchParams.fromMonth);
  } else {
    // default: trailing 6 months (5 before "to")
    const idx = toY * 12 + (toM - 1) - 5;
    fromY = Math.floor(idx / 12);
    fromM = (idx % 12) + 1;
  }
  const sgd = searchParams.sgd === "1";

  // Normalise the range and cap the number of columns.
  let fromIdx = fromY * 12 + (fromM - 1);
  let toIdx = toY * 12 + (toM - 1);
  if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
  const clamped = toIdx - fromIdx + 1 > MAX_COLS;
  if (clamped) fromIdx = toIdx - (MAX_COLS - 1);

  const colPairs: { year: number; month: number }[] = [];
  const cols: MatrixCol[] = [];
  for (let i = fromIdx; i <= toIdx; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    colPairs.push({ year: y, month: m });
    cols.push({ key: `${y}-${m}`, label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}` });
  }
  const colIndex = new Map(colPairs.map((c, i) => [`${c.year}-${c.month}`, i]));
  const minYear = colPairs[0].year;
  const maxYear = colPairs[colPairs.length - 1].year;

  const supabase = createClient();
  const [{ data: memberRows }, { data: invRows }, { data: fxRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, supplier_code, member_type, currency")
      .eq("active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select(
        "id, team_member_id, period_year, period_month, total, currency, bundled_into_invoice_id, bundled_sgd_amount, bundled_rate"
      )
      .eq("status", "paid")
      .gte("period_year", minYear)
      .lte("period_year", maxYear),
    supabase
      .from("report_fx_rates")
      .select("year, month, currency, units_per_sgd")
      .gte("year", minYear)
      .lte("year", maxYear),
  ]);

  const membersRaw = (memberRows as MemberLite[]) ?? [];
  // Individuals first, then suppliers — each alphabetical.
  const members = [...membersRaw].sort((a, b) => {
    const as = a.member_type === "supplier" ? 1 : 0;
    const bs = b.member_type === "supplier" ? 1 : 0;
    return as - bs || a.name.localeCompare(b.name);
  });
  const memberType = new Map(members.map((m) => [m.id, m.member_type]));

  const invoices = ((invRows as InvoiceLite[]) ?? []).filter((i) =>
    colIndex.has(`${i.period_year}-${i.period_month}`)
  );

  // Supplier invoices are broken down by roster member, so pull their line items.
  const supInvMeta = new Map<
    string,
    { tm: string; ci: number; currency: Currency; year: number; month: number }
  >();
  invoices.forEach((i) => {
    if (memberType.get(i.team_member_id) !== "supplier") return;
    const ci = colIndex.get(`${i.period_year}-${i.period_month}`);
    if (ci === undefined) return;
    supInvMeta.set(i.id, {
      tm: i.team_member_id,
      ci,
      currency: i.currency as Currency,
      year: i.period_year,
      month: i.period_month,
    });
  });
  const supInvIds = [...supInvMeta.keys()];
  const { data: liRows } = supInvIds.length
    ? await supabase
        .from("invoice_line_items")
        .select("invoice_id, supplier_member_id, worked_by_name, line_total, source_individual_invoice_id")
        .in("invoice_id", supInvIds)
    : { data: [] as LineLite[] };

  const fx = new Map<string, number>();
  ((fxRows as { year: number; month: number; currency: Currency; units_per_sgd: number }[]) ?? []).forEach(
    (r) => fx.set(`${r.year}-${r.month}-${r.currency}`, Number(r.units_per_sgd))
  );
  const rateFor = (y: number, m: number, cur: Currency): number | null =>
    cur === "SGD" ? 1 : fx.get(`${y}-${m}-${cur}`) ?? null;

  type Acc = { native: number; sgd: number; sgdMissing: boolean };
  const cellAcc = new Map<string, Acc>(); // `${teamMemberId}|${ci}`
  const subAcc = new Map<string, Acc>(); // `${supplierTeamMemberId}|${ci}|${rosterKey}`
  const supRosterKeys = new Map<string, Set<string>>(); // supplier -> roster keys seen
  const subName = new Map<string, string>(); // supplier_member_id -> display name
  let anyMissingRate = false;

  const addAcc = (map: Map<string, Acc>, key: string, native: number, sgd: number | null) => {
    const acc = map.get(key) ?? { native: 0, sgd: 0, sgdMissing: false };
    acc.native += native;
    if (sgd == null) acc.sgdMissing = true;
    else acc.sgd += sgd;
    map.set(key, acc);
  };

  // Individuals: their own paid invoice total (in their currency, normally SGD).
  invoices.forEach((i) => {
    if (memberType.get(i.team_member_id) === "supplier") return;
    const ci = colIndex.get(`${i.period_year}-${i.period_month}`);
    if (ci === undefined) return;
    const rate = rateFor(i.period_year, i.period_month, i.currency as Currency);
    if (rate == null) anyMissingRate = true;
    addAcc(cellAcc, `${i.team_member_id}|${ci}`, Number(i.total), rate == null ? null : Number(i.total) / rate);
  });

  // Suppliers: cells + per-roster-member breakdown, built from the line items.
  // Bundled individual lines are skipped (those individuals show on their own rows).
  ((liRows as LineLite[]) ?? []).forEach((li) => {
    if (li.source_individual_invoice_id) return;
    const meta = supInvMeta.get(li.invoice_id);
    if (!meta) return;
    const amt = Number(li.line_total);
    const rate = rateFor(meta.year, meta.month, meta.currency);
    if (rate == null) anyMissingRate = true;
    const sgd = rate == null ? null : amt / rate;
    const rosterKey = li.supplier_member_id ?? OTHER;
    addAcc(cellAcc, `${meta.tm}|${meta.ci}`, amt, sgd);
    addAcc(subAcc, `${meta.tm}|${meta.ci}|${rosterKey}`, amt, sgd);
    const set = supRosterKeys.get(meta.tm) ?? new Set<string>();
    set.add(rosterKey);
    supRosterKeys.set(meta.tm, set);
    if (li.supplier_member_id) {
      subName.set(li.supplier_member_id, li.worked_by_name ?? "Roster member");
    }
  });

  const cellsFrom = (
    get: (ci: number) => Acc | undefined
  ): { cells: MatrixCell[]; rowTotal: number | null } => {
    const cells: MatrixCell[] = colPairs.map((_, ci) => {
      const acc = get(ci);
      if (!acc) return { value: null };
      if (sgd) return acc.sgdMissing ? { value: null, missingRate: true } : { value: round2(acc.sgd) };
      return { value: round2(acc.native) };
    });
    const usable = cells.filter((c) => c.value != null && !c.missingRate).map((c) => c.value!);
    const rowTotal = cells.some((c) => c.value != null || c.missingRate)
      ? round2(usable.reduce((s, v) => s + v, 0))
      : null;
    return { cells, rowTotal };
  };

  const rows: MatrixRow[] = members.map((m) => {
    const cur = m.currency as Currency;
    const isSupplier = m.member_type === "supplier";
    const main = cellsFrom((ci) => cellAcc.get(`${m.id}|${ci}`));

    let subRows: MatrixSubRow[] | undefined;
    if (isSupplier) {
      const keys = [...(supRosterKeys.get(m.id) ?? new Set<string>())];
      const memberKeys = keys
        .filter((k) => k !== OTHER)
        .sort((a, b) => (subName.get(a) ?? "").localeCompare(subName.get(b) ?? ""));
      const ordered = [...memberKeys, ...(keys.includes(OTHER) ? [OTHER] : [])];
      const built = ordered.map((k) => {
        const c = cellsFrom((ci) => subAcc.get(`${m.id}|${ci}|${k}`));
        return {
          id: k,
          name: k === OTHER ? "Expenses & adjustments" : subName.get(k) ?? "Roster member",
          cells: c.cells,
          rowTotal: c.rowTotal,
          isOther: k === OTHER,
        };
      });
      if (built.length > 0) subRows = built;
    }

    return {
      id: m.id,
      name: m.name,
      idLabel: m.employee_id ?? m.supplier_code ?? "",
      isSupplier,
      currency: cur,
      cells: main.cells,
      rowTotal: main.rowTotal,
      subRows,
    };
  });

  let columnTotals: (number | null)[] | undefined;
  let grandTotal: number | null | undefined;
  if (sgd) {
    columnTotals = colPairs.map((_, ci) => {
      let sum = 0;
      let has = false;
      rows.forEach((r) => {
        const c = r.cells[ci];
        if (c.value != null && !c.missingRate) {
          sum += c.value;
          has = true;
        }
      });
      return has ? round2(sum) : null;
    });
    const gvals = columnTotals.filter((v): v is number => v != null);
    grandTotal = gvals.length ? round2(gvals.reduce((s, v) => s + v, 0)) : null;
  }

  // Year options: cover a few recent years plus whatever is currently selected.
  const years: number[] = [];
  for (let y = Math.min(2024, fromY); y <= Math.max(curY, toY); y++) years.push(y);

  return (
    <>
      <PageHeader
        title="Payroll by month"
        description="Total paid to each employee, month by month across the selected range. Only invoices marked Paid are counted."
        action={
          <div className="flex gap-2">
            <Button href="/hr/reports" variant="neutral">
              Monthly report
            </Button>
            <PrintButton />
          </div>
        }
      />

      <div className="mb-6 no-print">
        <HistoryControls
          fromYear={colPairs[0].year}
          fromMonth={colPairs[0].month}
          toYear={colPairs[colPairs.length - 1].year}
          toMonth={colPairs[colPairs.length - 1].month}
          sgd={sgd}
          years={years}
        />
      </div>

      {clamped && (
        <Alert tone="info" className="mb-4 no-print">
          That range is longer than {MAX_COLS} months — showing the most recent {MAX_COLS}.
        </Alert>
      )}
      {sgd && anyMissingRate && (
        <Alert tone="warning" className="mb-4">
          Some months are missing an exchange rate, so those amounts can&apos;t be converted to SGD
          (shown as “n/a”) and are left out of the totals. Set the rates in the monthly report.
        </Alert>
      )}

      <div className="print-area">
        <PayrollMatrix
          cols={cols}
          rows={rows}
          mode={sgd ? "sgd" : "native"}
          columnTotals={columnTotals}
          grandTotal={grandTotal}
        />
      </div>
    </>
  );
}
