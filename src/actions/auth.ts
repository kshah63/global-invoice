"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sign in with either an email (HR / department heads) or a 4-digit employee ID
 * (team members). The employee ID is resolved server-side to the account's
 * login email; errors are intentionally generic to avoid revealing which
 * employee IDs / emails exist.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string
): Promise<{ error?: string }> {
  const id = identifier.trim();
  if (!id || !password) return { error: "Enter your employee ID (or email) and password." };

  const isEmployeeId = /^[0-9]{4}$/.test(id);
  let email: string | null = null;

  if (isEmployeeId) {
    // Look up the account behind this employee ID (service role, bypasses RLS).
    const admin = createAdminClient();
    const { data: tm } = await admin
      .from("team_members")
      .select("profile_id")
      .eq("employee_id", id)
      .maybeSingle();
    if (tm?.profile_id) {
      const { data: userRes } = await admin.auth.admin.getUserById(tm.profile_id);
      email = userRes?.user?.email ?? null;
    }
    if (!email) return { error: "Invalid employee ID or password." };
  } else {
    email = id; // treat as an email address
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: isEmployeeId
        ? "Invalid employee ID or password."
        : "Invalid email or password.",
    };
  }
  return {};
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
