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
  // Drive from all active team members so the payroll report covers everyone,
  // not just those who already have an invoice for the period.
  const [{ data: memberRows }, { data: invRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, employee_id, currency, payment_details")
      .eq("active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select("*")
      .eq("period_year", year)
      .eq("period_month", month),
  ]);

  const members = (memberRows as any[]) ?? [];
  const invByMember = new Map<string, any>();
  ((invRows as any[]) ?? []).forEach((i) => invByMember.set(i.team_member_id, i));

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
  const body = members.map((m) => {
    const inv = invByMember.get(m.id);
    return [
      m.employee_id,
      m.name,
      inv?.invoice_number ?? "",
      inv?.status ?? "not_started",
      inv?.currency ?? m.currency,
      inv?.subtotal ?? "",
      inv?.tax_rate ?? "",
      inv?.tax_amount ?? "",
      inv?.total ?? "",
      m.payment_details ?? "",
    ];
  });

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
