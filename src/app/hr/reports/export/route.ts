import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  const { data } = await supabase
    .from("invoices")
    .select("*, team_members(name, employee_id, payment_details)")
    .eq("period_year", year)
    .eq("period_month", month)
    .order("status");

  const rows = (data as any[]) ?? [];
  const header = [
    "Employee ID",
    "Name",
    "Invoice Number",
    "Status",
    "Currency",
    "Subtotal",
    "Tax Rate %",
    "Tax Amount",
    "Total",
    "Payment Details",
  ];
  const body = rows.map((r) => [
    r.team_members?.employee_id ?? "",
    r.team_members?.name ?? r.display_name,
    r.invoice_number,
    r.status,
    r.currency,
    r.subtotal,
    r.tax_rate,
    r.tax_amount,
    r.total,
    r.team_members?.payment_details ?? "",
  ]);

  const csv = [header, ...body]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const filename = `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
