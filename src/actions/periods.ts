"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

async function ensureHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");
  return session;
}

export async function openPeriod(formData: FormData) {
  const session = await ensureHr();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const note = (formData.get("note") as string) || null;
  const supabase = createClient();

  const { error } = await supabase.from("invoice_periods").upsert(
    {
      year,
      month,
      is_open: true,
      opened_by: session.profile.id,
      opened_at: new Date().toISOString(),
      note,
    },
    { onConflict: "year,month" }
  );

  if (error) {
    redirect(`/hr/periods?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/hr/periods");
  revalidatePath("/hr");
  revalidatePath("/team");
  redirect(`/hr/periods?ok=${encodeURIComponent("Period opened for invoicing.")}`);
}

export async function setPeriodOpen(formData: FormData) {
  await ensureHr();
  const id = String(formData.get("id"));
  const isOpen = String(formData.get("is_open")) === "true";
  const supabase = createClient();
  await supabase.from("invoice_periods").update({ is_open: isOpen }).eq("id", id);
  revalidatePath("/hr/periods");
  revalidatePath("/team");
  redirect("/hr/periods");
}
