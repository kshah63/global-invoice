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

  const fx = new Map<string, number>();
  ((fxRows as { year: number; month: number; currency: Currency; units_per_sgd: number }[]) ?? []).forEach(
    (r) => fx.set(`${r.year}-${r.month}-${r.currency}`, Number(r.units_per_sgd))
  );
  const rateFor = (y: number, m: number, cur: Currency): number | null =>
    cur === "SGD" ? 1 : fx.get(`${y}-${m}-${cur}`) ?? null;

  // Individuals bundled into a supplier are paid via that supplier's transfer, so
  // the supplier's own pay excludes them (they appear on their own rows). Sum the
  // bundled portion per supplier invoice.
  const bundledNativeByInv = new Map<string, number>();
  const bundledSgdByInv = new Map<string, number>();
  invoices.forEach((i) => {
    if (i.bundled_into_invoice_id) {
      const sgdAmt = Number(i.bundled_sgd_amount ?? 0);
      const nat = sgdAmt * Number(i.bundled_rate ?? 0);
      bundledNativeByInv.set(
        i.bundled_into_invoice_id,
        (bundledNativeByInv.get(i.bundled_into_invoice_id) ?? 0) + nat
      );
      bundledSgdByInv.set(
        i.bundled_into_invoice_id,
        (bundledSgdByInv.get(i.bundled_into_invoice_id) ?? 0) + sgdAmt
      );
    }
  });

  type Acc = { native: number; sgd: number; sgdMissing: boolean };
  const cellAcc = new Map<string, Acc>();
  let anyMissingRate = false;

  invoices.forEach((i) => {
    const ci = colIndex.get(`${i.period_year}-${i.period_month}`);
    if (ci === undefined) return;
    const isSupplier = memberType.get(i.team_member_id) === "supplier";
    const cur = i.currency as Currency;
    const rate = rateFor(i.period_year, i.period_month, cur);

    let nativeOwn = Number(i.total);
    let sgdOwn: number | null;
    if (isSupplier) {
      nativeOwn = Number(i.total) - (bundledNativeByInv.get(i.id) ?? 0);
      sgdOwn = rate == null ? null : Number(i.total) / rate - (bundledSgdByInv.get(i.id) ?? 0);
    } else {
      sgdOwn = rate == null ? null : Number(i.total) / rate;
    }
    if (sgdOwn == null) anyMissingRate = true;

    const key = `${i.team_member_id}|${ci}`;
    const acc = cellAcc.get(key) ?? { native: 0, sgd: 0, sgdMissing: false };
    acc.native += nativeOwn;
    if (sgdOwn == null) acc.sgdMissing = true;
    else acc.sgd += sgdOwn;
    cellAcc.set(key, acc);
  });

  const rows: MatrixRow[] = members.map((m) => {
    const cur = m.currency as Currency;
    const cells: MatrixCell[] = colPairs.map((_, ci) => {
      const acc = cellAcc.get(`${m.id}|${ci}`);
      if (!acc) return { value: null };
      if (sgd) {
        return acc.sgdMissing ? { value: null, missingRate: true } : { value: round2(acc.sgd) };
      }
      return { value: round2(acc.native) };
    });
    const usable = cells.filter((c) => c.value != null && !c.missingRate).map((c) => c.value!);
    const rowTotal = cells.some((c) => c.value != null || c.missingRate)
      ? round2(usable.reduce((s, v) => s + v, 0))
      : null;
    return {
      id: m.id,
      name: m.name,
      idLabel: m.employee_id ?? m.supplier_code ?? "",
      isSupplier: m.member_type === "supplier",
      currency: cur,
      cells,
      rowTotal,
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
