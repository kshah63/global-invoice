import { type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_META, periodLabel, type DashboardStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONEY_FMT = "#,##0.00";
const BRAND = "FF2E3192"; // indigo
const HEADER_TEXT = "FFFFFFFF";
const ZEBRA = "FFF4F6FB"; // very light indigo-grey
const GRID = "FFDBE1E9"; // light border

const thin = { style: "thin" as const, color: { argb: GRID } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

type MemberRow = {
  id: string;
  name: string;
  employee_id: string | null;
  supplier_code: string | null;
  member_type: string;
  currency: string;
  payment_details: string | null;
};
type InvoiceRow = {
  id: string;
  team_member_id: string;
  invoice_number: string;
  status: DashboardStatus;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
};
type LineRow = {
  invoice_id: string;
  supplier_member_id: string | null;
  worked_by_name: string | null;
  line_total: number;
};

function styleHeader(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle" };
    cell.border = BORDER;
  }
  row.height = 20;
}

function borderRow(row: ExcelJS.Row, cols: number, fill?: string) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.border = BORDER;
    if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const supabase = createClient();
  const [{ data: memberRows }, { data: invRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, supplier_code, member_type, currency, payment_details")
      .eq("active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select("id, team_member_id, invoice_number, status, currency, subtotal, tax_rate, tax_amount, total")
      .eq("period_year", year)
      .eq("period_month", month),
  ]);

  const members = (memberRows as MemberRow[]) ?? [];
  const invByMember = new Map<string, InvoiceRow>();
  ((invRows as InvoiceRow[]) ?? []).forEach((i) => invByMember.set(i.team_member_id, i));

  // Per-member breakdown for supplier invoices.
  const supplierInvoiceIds = members
    .filter((m) => m.member_type === "supplier" && invByMember.get(m.id))
    .map((m) => invByMember.get(m.id)!.id);
  const { data: liRows } = supplierInvoiceIds.length
    ? await supabase
        .from("invoice_line_items")
        .select("invoice_id, supplier_member_id, worked_by_name, line_total")
        .in("invoice_id", supplierInvoiceIds)
    : { data: [] as LineRow[] };
  const breakdown = new Map<string, { people: Map<string, { name: string; total: number }>; other: number }>();
  ((liRows as LineRow[]) ?? []).forEach((li) => {
    const g = breakdown.get(li.invoice_id) ?? { people: new Map(), other: 0 };
    if (li.supplier_member_id) {
      const cur = g.people.get(li.supplier_member_id) ?? { name: li.worked_by_name ?? "Member", total: 0 };
      cur.total += Number(li.line_total);
      g.people.set(li.supplier_member_id, cur);
    } else {
      g.other += Number(li.line_total);
    }
    breakdown.set(li.invoice_id, g);
  });

  // Per-currency payable totals (finalised) and grand totals (all invoices).
  const FINALISED = new Set(["approved", "locked", "paid"]);
  const payable = new Map<string, number>();
  const grand = new Map<string, { subtotal: number; tax: number; total: number }>();
  members.forEach((m) => {
    const inv = invByMember.get(m.id);
    if (!inv) return;
    if (FINALISED.has(inv.status)) {
      payable.set(inv.currency, (payable.get(inv.currency) ?? 0) + Number(inv.total));
    }
    const g = grand.get(inv.currency) ?? { subtotal: 0, tax: 0, total: 0 };
    g.subtotal += Number(inv.subtotal);
    g.tax += Number(inv.tax_amount);
    g.total += Number(inv.total);
    grand.set(inv.currency, g);
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "MathVision Invoicing";
  wb.created = now;

  // ---- Sheet 1: Payroll ---------------------------------------------------
  const COLS = 11;
  const ws = wb.addWorksheet("Payroll", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = [
    { key: "id", width: 12 },
    { key: "type", width: 11 },
    { key: "name", width: 28 },
    { key: "invoice", width: 16 },
    { key: "status", width: 14 },
    { key: "currency", width: 9 },
    { key: "subtotal", width: 13 },
    { key: "taxrate", width: 8 },
    { key: "tax", width: 12 },
    { key: "total", width: 14 },
    { key: "payment", width: 42 },
  ];

  const title = ws.getCell("A1");
  title.value = `Payroll — ${periodLabel(year, month)}`;
  title.font = { bold: true, size: 15, color: { argb: BRAND } };
  ws.mergeCells("A1:E1");

  const payableStr =
    payable.size > 0
      ? [...payable.entries()]
          .map(([cur, tot]) => `${cur} ${tot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
          .join("   ·   ")
      : "None finalised yet";
  const sub = ws.getCell("A2");
  sub.value = `Payable (finalised): ${payableStr}`;
  sub.font = { color: { argb: "FF6B7A8E" } };
  ws.mergeCells("A2:K2");

  const header = ws.getRow(4);
  header.values = [
    "ID",
    "Type",
    "Name",
    "Invoice #",
    "Status",
    "Currency",
    "Subtotal",
    "Tax %",
    "Tax",
    "Total",
    "Payment details",
  ];
  styleHeader(header, COLS);

  const dataStart = 5;
  members.forEach((m, i) => {
    const inv = invByMember.get(m.id);
    const status = (inv?.status ?? "not_started") as DashboardStatus;
    const row = ws.addRow({
      id: m.employee_id ?? m.supplier_code ?? "",
      type: m.member_type === "supplier" ? "Supplier" : "Individual",
      name: m.name,
      invoice: inv?.invoice_number ?? "",
      status: STATUS_META[status]?.label ?? status,
      currency: inv?.currency ?? m.currency,
      subtotal: inv ? Number(inv.subtotal) : null,
      taxrate: inv ? Number(inv.tax_rate) : null,
      tax: inv ? Number(inv.tax_amount) : null,
      total: inv ? Number(inv.total) : null,
      payment: m.payment_details ?? "",
    });
    borderRow(row, COLS, i % 2 === 1 ? ZEBRA : undefined);
    ["subtotal", "tax", "total"].forEach((k) => (row.getCell(k).numFmt = MONEY_FMT));
    row.getCell("taxrate").numFmt = '0.###"%"';
    row.getCell("total").font = { bold: true };
    row.getCell("payment").alignment = { wrapText: true, vertical: "top" };
  });
  const dataEnd = 4 + members.length;
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS } };

  // Per-currency grand totals (all invoices this period), as live SUMIF rows.
  if (members.length > 0 && grand.size > 0) {
    ws.addRow({}); // spacer
    for (const [cur, g] of grand.entries()) {
      const row = ws.addRow({ name: `Total — ${cur}`, currency: cur });
      const r = row.number;
      row.getCell("subtotal").value = {
        formula: `SUMIF($F$${dataStart}:$F$${dataEnd},$F$${r},$G$${dataStart}:$G$${dataEnd})`,
        result: g.subtotal,
      };
      row.getCell("tax").value = {
        formula: `SUMIF($F$${dataStart}:$F$${dataEnd},$F$${r},$I$${dataStart}:$I$${dataEnd})`,
        result: g.tax,
      };
      row.getCell("total").value = {
        formula: `SUMIF($F$${dataStart}:$F$${dataEnd},$F$${r},$J$${dataStart}:$J$${dataEnd})`,
        result: g.total,
      };
      borderRow(row, COLS);
      ["subtotal", "tax", "total"].forEach((k) => {
        const cell = row.getCell(k);
        cell.numFmt = MONEY_FMT;
        cell.font = { bold: true };
        cell.border = { ...BORDER, top: { style: "medium", color: { argb: BRAND } } };
      });
      row.getCell("name").font = { bold: true };
      row.getCell("name").border = { ...BORDER, top: { style: "medium", color: { argb: BRAND } } };
      row.getCell("currency").font = { bold: true };
      row.getCell("currency").border = { ...BORDER, top: { style: "medium", color: { argb: BRAND } } };
    }
  }

  // ---- Sheet 2: Supplier breakdown ---------------------------------------
  const suppliers = members.filter((m) => m.member_type === "supplier" && invByMember.get(m.id));
  if (suppliers.length > 0) {
    const BCOLS = 4;
    const bs = wb.addWorksheet("Supplier breakdown", { views: [{ state: "frozen", ySplit: 3 }] });
    bs.columns = [
      { key: "supplier", width: 24 },
      { key: "member", width: 30 },
      { key: "amount", width: 14 },
      { key: "currency", width: 9 },
    ];
    const bt = bs.getCell("A1");
    bt.value = `Supplier breakdown — ${periodLabel(year, month)}`;
    bt.font = { bold: true, size: 15, color: { argb: BRAND } };
    bs.mergeCells("A1:D1");

    const bh = bs.getRow(3);
    bh.values = ["Supplier", "Roster member", "Amount", "Currency"];
    styleHeader(bh, BCOLS);

    suppliers.forEach((m) => {
      const inv = invByMember.get(m.id)!;
      const b = breakdown.get(inv.id) ?? { people: new Map<string, { name: string; total: number }>(), other: 0 };
      const people = [...b.people.values()].sort((a, c) => a.name.localeCompare(c.name));
      const entries: { member: string; amount: number }[] = people.map((p) => ({ member: p.name, amount: p.total }));
      if (b.other !== 0) entries.push({ member: "Expenses & adjustments", amount: b.other });
      if (entries.length === 0) entries.push({ member: "(no roster lines yet)", amount: 0 });

      entries.forEach((e, i) => {
        const row = bs.addRow({ supplier: m.name, member: e.member, amount: e.amount, currency: inv.currency });
        borderRow(row, BCOLS, i % 2 === 1 ? ZEBRA : undefined);
        row.getCell("amount").numFmt = MONEY_FMT;
      });
      const totalRow = bs.addRow({ member: `${m.name} — total`, amount: Number(inv.total), currency: inv.currency });
      borderRow(totalRow, BCOLS);
      totalRow.getCell("member").font = { bold: true };
      totalRow.getCell("amount").numFmt = MONEY_FMT;
      totalRow.getCell("amount").font = { bold: true };
      for (let c = 1; c <= BCOLS; c++) {
        totalRow.getCell(c).border = { ...BORDER, top: { style: "medium", color: { argb: BRAND } } };
      }
      bs.addRow({}); // spacer
    });
    bs.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: BCOLS } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `payroll-${year}-${String(month).padStart(2, "0")}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
