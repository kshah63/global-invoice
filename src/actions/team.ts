"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Team member self-service: the only fields a team member may change on their
 * own record are the invoice display name (and whether to use HR's name) and
 * their ship-to address. Enforced again by a DB trigger.
 */
export async function updateInvoicePrefs(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const useHrName = String(formData.get("use_hr_name")) === "true";
  const customName = String(formData.get("invoice_display_name") || "").trim();
  const shipTo = String(formData.get("ship_to_address") || "").trim();

  const { error } = await supabase
    .from("team_members")
    .update({
      use_hr_name: useHrName,
      invoice_display_name: customName || null,
      ship_to_address: shipTo || null,
    })
    .eq("profile_id", user.id);

  if (error) {
    redirect(`/team/profile?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/team/profile");
  revalidatePath("/team");
  redirect(`/team/profile?ok=${encodeURIComponent("Preferences saved.")}`);
}
