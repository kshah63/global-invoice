"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// --- Member: create their own invoice for an open period ------------------

export async function createMemberInvoice(formData: FormData) {
  const year = Number(formData.get("period_year"));
  const month = Number(formData.get("period_month"));
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("supplier_members")
    .select("id, name, supplier_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!member) redirect("/member?error=No roster member is linked to your account.");

  const { data: period } = await supabase
    .from("invoice_periods")
    .select("is_open")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (!period || !period.is_open) {
    redirect("/member?error=That month is not open for invoicing yet.");
  }

  const { data: existing } = await supabase
    .from("supplier_member_invoices")
    .select("id")
    .eq("supplier_member_id", member.id)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  if (existing) redirect(`/member/invoices/${existing.id}`);

  // Currency follows the supplier. Read it with the admin client — a roster
  // member can't select their supplier's team_members row under RLS, so an
  // RLS read would return null and wrongly default the currency to SGD.
  const admin = createAdminClient();
  const { data: supplier } = await admin
    .from("team_members")
    .select("currency")
    .eq("id", member.supplier_id)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("supplier_member_invoices")
    .insert({
      supplier_member_id: member.id,
      supplier_id: member.supplier_id,
      period_year: year,
      period_month: month,
      status: "draft",
      display_name: member.name,
      currency: supplier?.currency ?? "SGD",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    redirect(
      `/member?error=${encodeURIComponent(error?.message ?? "Could not create your invoice.")}`
    );
  }

  revalidatePath("/member");
  redirect(`/member/invoices/${inserted.id}`);
}

// --- Member: save draft (atomic, via RPC) ---------------------------------
// The base pay line is resolved server-side from the roster config; the client
// only supplies the worked quantity (rate members) and adjustment lines.

export interface MemberAdjustmentInput {
  note: string | null;
  rate_descriptor: string; // the description
  rate_amount: number; // signed (negative = deduction)
  sort_order: number;
}

export interface MemberRateLineInput {
  rate_id: string;
  quantity: number; // sessions/hours worked at this rate
}

export interface SaveMemberInvoiceInput {
  invoiceId: string;
  displayName: string;
  notes: string | null;
  lines: MemberRateLineInput[]; // per-rate quantities (ignored for fixed salary)
  adjustments: MemberAdjustmentInput[];
  // For fixed-salary members: sessions/hours worked (record only, not pay).
  fixedSessions?: number;
  fixedHours?: number;
}

export async function saveMemberInvoice(
  input: SaveMemberInvoiceInput
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("save_member_invoice", {
    p_invoice: input.invoiceId,
    p_display_name: input.displayName,
    p_notes: input.notes,
    p_lines: input.lines,
    p_adjustments: input.adjustments,
    p_fixed_sessions: input.fixedSessions ?? 0,
    p_fixed_hours: input.fixedHours ?? 0,
  });
  if (error) return { error: error.message };

  revalidatePath(`/member/invoices/${input.invoiceId}`);
  revalidatePath("/member");
  return {};
}

export async function submitMemberInvoice(
  id: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: items } = await supabase
    .from("supplier_member_invoice_items")
    .select("id")
    .eq("member_invoice_id", id)
    .limit(1);
  if (!items || items.length === 0) {
    return { error: "Add at least one line before submitting." };
  }

  const { error } = await supabase
    .from("supplier_member_invoices")
    .update({ status: "submitted" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/member/invoices/${id}`);
  revalidatePath("/member");
  return {};
}

export async function deleteMemberInvoice(formData: FormData) {
  const id = String(formData.get("invoice_id"));
  const supabase = createClient();
  const { error } = await supabase
    .from("supplier_member_invoices")
    .delete()
    .eq("id", id);
  if (error) {
    redirect(`/member/invoices/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/member");
  redirect("/member");
}

// --- Leader / HR: consolidation -------------------------------------------

export async function pullMemberInvoices(
  consolidatedInvoiceId: string
): Promise<{ error?: string; count?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("pull_member_invoices", {
    p_invoice: consolidatedInvoiceId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/team/invoices/${consolidatedInvoiceId}`);
  return { count: typeof data === "number" ? data : undefined };
}

export async function returnMemberInvoice(
  memberInvoiceId: string,
  note: string,
  consolidatedInvoiceId?: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("return_member_invoice", {
    p_invoice: memberInvoiceId,
    p_note: note,
  });
  if (error) return { error: error.message };
  if (consolidatedInvoiceId) {
    revalidatePath(`/team/invoices/${consolidatedInvoiceId}`);
  }
  return {};
}
