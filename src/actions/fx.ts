"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { Currency } from "@/lib/constants";

export interface FxRateInput {
  currency: Currency;
  unitsPerSgd: number; // how many units of `currency` = 1 SGD
}

/**
 * Save the month's report exchange rates (units of each non-SGD currency per
 * 1 SGD). Persisted per (year, month, currency) so they survive month changes.
 */
export async function saveReportFxRates(
  year: number,
  month: number,
  rates: FxRateInput[]
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return { error: "Not allowed." };

  const supabase = createClient();
  const now = new Date().toISOString();
  const rows = rates
    .filter((r) => r.currency !== "SGD" && Number.isFinite(r.unitsPerSgd) && r.unitsPerSgd > 0)
    .map((r) => ({
      year,
      month,
      currency: r.currency,
      units_per_sgd: r.unitsPerSgd,
      updated_at: now,
      updated_by: session.profile.id,
    }));

  if (rows.length) {
    const { error } = await supabase
      .from("report_fx_rates")
      .upsert(rows, { onConflict: "year,month,currency" });
    if (error) return { error: error.message };
  }

  revalidatePath("/hr/reports");
  return {};
}
