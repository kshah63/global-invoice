"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { generateInvoiceNumber, isValidHrTransition, type HrAction } from "@/lib/invoice";
import type { Centre, RateUnit, TaskType } from "@/lib/constants";

// --- Team member: create an invoice for an open period --------------------

export async function createInvoice(formData: FormData) {
  const year = Number(formData.get("period_year"));
  const month = Number(formData.get("period_month"));
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tm } = await supabase
    .from("team_members")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!tm) redirect("/team?error=No team member profile is linked to your account.");

  const { data: period } = await supabase
    .from("invoice_periods")
    .select("is_open")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (!period || !period.is_open) {
    redirect("/team/invoices?error=That month is not open for invoicing yet.");
  }

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("team_member_id", tm.id)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  if (existing) redirect(`/team/invoices/${existing.id}`);

  const { data: company } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const displayName = tm.use_hr_name
    ? tm.name
    : tm.invoice_display_name || tm.name;

  // Individuals use their 4-digit employee ID; suppliers use their supplier code.
  const idPart =
    tm.member_type === "supplier"
      ? tm.supplier_code || "SUP"
      : tm.employee_id || "0000";

  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert({
      team_member_id: tm.id,
      period_year: year,
      period_month: month,
      invoice_number: generateInvoiceNumber(idPart, year, month),
      status: "draft",
      display_name: displayName,
      ship_to_address: tm.ship_to_address,
      currency: tm.currency,
      company_snapshot: company
        ? {
            company_name: company.company_name,
            address: company.address,
            email: company.email,
            phone: company.phone,
            registration_no: company.registration_no,
          }
        : null,
      tax_rate: 0,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    redirect(
      `/team/invoices?error=${encodeURIComponent(error?.message ?? "Could not create invoice.")}`
    );
  }

  revalidatePath("/team/invoices");
  revalidatePath("/team");
  redirect(`/team/invoices/${inserted.id}`);
}

// --- Team member: save draft (atomic, via RPC) ----------------------------

export interface SaveInvoiceItem {
  centre: Centre;
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  rate_id: string | null;
  rate_descriptor: string | null;
  rate_unit: RateUnit;
  rate_amount: number;
  sort_order: number;
}

export interface SaveInvoiceInput {
  invoiceId: string;
  displayName: string;
  shipTo: string | null;
  notes: string | null;
  taxRate: number;
  items: SaveInvoiceItem[];
}

export async function saveInvoice(
  input: SaveInvoiceInput
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("save_invoice", {
    p_invoice: input.invoiceId,
    p_display_name: input.displayName,
    p_ship_to: input.shipTo,
    p_notes: input.notes,
    p_tax_rate: input.taxRate,
    p_items: input.items,
  });
  if (error) return { error: error.message };

  revalidatePath(`/team/invoices/${input.invoiceId}`);
  revalidatePath("/team/invoices");
  revalidatePath("/team");
  return {};
}

// --- Supplier: save invoice (atomic, via RPC) -----------------------------

export interface SaveSupplierItem {
  centre: Centre;
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  rate_id: string | null; // supplier_member_rates id (person lines)
  rate_descriptor: string | null;
  rate_unit: RateUnit; // "fixed" for adjustment/misc lines
  rate_amount: number; // typed amount for "fixed" lines
  sort_order: number;
  supplier_member_id: string | null;
}

export interface SaveSupplierInvoiceInput {
  invoiceId: string;
  displayName: string;
  shipTo: string | null;
  notes: string | null;
  taxRate: number;
  items: SaveSupplierItem[];
}

export async function saveSupplierInvoice(
  input: SaveSupplierInvoiceInput
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("save_supplier_invoice", {
    p_invoice: input.invoiceId,
    p_display_name: input.displayName,
    p_ship_to: input.shipTo,
    p_notes: input.notes,
    p_tax_rate: input.taxRate,
    p_items: input.items,
  });
  if (error) return { error: error.message };

  revalidatePath(`/team/invoices/${input.invoiceId}`);
  revalidatePath("/team/invoices");
  revalidatePath("/team");
  return {};
}

// --- Team member: submit --------------------------------------------------

export async function submitInvoiceById(
  id: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: items } = await supabase
    .from("invoice_line_items")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);

  if (!items || items.length === 0) {
    return { error: "Add at least one line item before submitting." };
  }

  // submitted_at is set by the DB status-timestamp trigger.
  const { error } = await supabase
    .from("invoices")
    .update({ status: "submitted" })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/team/invoices/${id}`);
  revalidatePath("/team/invoices");
  revalidatePath("/team");
  return {};
}

// --- Team member: delete a draft ------------------------------------------

export async function deleteInvoice(formData: FormData) {
  const id = String(formData.get("invoice_id"));
  const supabase = createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) {
    redirect(`/team/invoices/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/team/invoices");
  redirect("/team/invoices");
}

// --- HR: status transitions -----------------------------------------------

export async function hrInvoiceTransition(formData: FormData) {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");

  const id = String(formData.get("invoice_id"));
  const action = String(formData.get("action")) as HrAction;
  const supabase = createClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!inv) redirect("/hr/invoices?error=Invoice not found.");

  const def = isValidHrTransition(inv.status, action);
  if (!def) {
    redirect(`/hr/invoices/${id}?error=${encodeURIComponent("That action is not available.")}`);
  }

  // Atomic, guarded transition: only apply if the status still matches what we
  // validated against (avoids a check-then-act race). Timestamps are set by the
  // DB status-timestamp trigger.
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ status: def.to })
    .eq("id", id)
    .eq("status", inv.status)
    .select("id");
  if (error) {
    redirect(`/hr/invoices/${id}?error=${encodeURIComponent(error.message)}`);
  }
  if (!updated || updated.length === 0) {
    redirect(
      `/hr/invoices/${id}?error=${encodeURIComponent("This invoice changed since you loaded it — please reload and try again.")}`
    );
  }

  revalidatePath(`/hr/invoices/${id}`);
  revalidatePath("/hr/invoices");
  revalidatePath("/hr");
  redirect(`/hr/invoices/${id}?ok=${encodeURIComponent(def.label + " done.")}`);
}
