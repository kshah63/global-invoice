"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

export async function sendBroadcast(formData: FormData) {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") redirect("/login");

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const yearRaw = formData.get("period_year");
  const monthRaw = formData.get("period_month");

  if (!subject || !body) {
    redirect(`/hr/messages?error=${encodeURIComponent("Subject and message are required.")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.from("messages").insert({
    sender_profile_id: session.profile.id,
    sender_name: session.profile.full_name ?? "HR",
    subject,
    body,
    period_year: yearRaw ? Number(yearRaw) : null,
    period_month: monthRaw ? Number(monthRaw) : null,
  });

  if (error) {
    redirect(`/hr/messages?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/hr/messages");
  revalidatePath("/team");
  redirect(`/hr/messages?ok=${encodeURIComponent("Message sent to all team members.")}`);
}
