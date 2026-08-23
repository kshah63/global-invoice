"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

// HR-only: a paid invoice whose bank transfer bounced is marked "reversed" and
// its amount carried into next month's invoice as a read-only line. See
// migration 0033 for the guarded server-side logic.

export async function reverseAndCarryInvoice(
  invoiceId: string,
  amount: number | null,
  note: string | null
): Promise<{ error?: string; targetId?: string }> {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return { error: "Not authorized." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("reverse_and_carry_invoice", {
    p_invoice: invoiceId,
    p_amount: amount,
    p_note: note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/hr/invoices/${invoiceId}`);
  if (typeof data === "string") revalidatePath(`/hr/invoices/${data}`);
  revalidatePath("/hr/invoices");
  revalidatePath("/hr/reports");
  revalidatePath("/hr");
  return { targetId: typeof data === "string" ? data : undefined };
}

export async function undoReverseAndCarry(
  invoiceId: string
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return { error: "Not authorized." };

  const supabase = createClient();
  const { error } = await supabase.rpc("undo_reverse_and_carry", {
    p_invoice: invoiceId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/hr/invoices/${invoiceId}`);
  revalidatePath("/hr/invoices");
  revalidatePath("/hr/reports");
  revalidatePath("/hr");
  return {};
}
