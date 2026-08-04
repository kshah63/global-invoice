"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

async function ensureHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return null;
  return session;
}

/**
 * Move an individual's invoice onto a supplier invoice (paid via one bulk
 * transfer). The amount is converted to the supplier's currency using the
 * month's report exchange rate. Idempotent — calling again re-syncs the
 * snapshot to the latest amount/rate.
 */
export async function bundleIndividualInvoice(
  individualInvoiceId: string,
  supplierInvoiceId: string
): Promise<{ error?: string }> {
  if (!(await ensureHr())) return { error: "Not allowed." };
  const supabase = createClient();
  const { error } = await supabase.rpc("bundle_individual_invoice", {
    p_individual: individualInvoiceId,
    p_supplier_invoice: supplierInvoiceId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/hr/invoices/${supplierInvoiceId}`);
  revalidatePath(`/hr/invoices/${individualInvoiceId}`);
  revalidatePath("/hr/reports");
  return {};
}

export async function unbundleIndividualInvoice(
  individualInvoiceId: string
): Promise<{ error?: string }> {
  if (!(await ensureHr())) return { error: "Not allowed." };
  const supabase = createClient();
  const { error } = await supabase.rpc("unbundle_individual_invoice", {
    p_individual: individualInvoiceId,
  });
  if (error) return { error: error.message };
  revalidatePath("/hr/invoices");
  revalidatePath("/hr/reports");
  return {};
}
