"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve a login identifier to an email. A 4-digit code is a team member's
 * employee ID or a department head's login code; anything with "@" is an email.
 */
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (/^[0-9]{4}$/.test(id)) {
    const admin = createAdminClient();

    // Team member employee ID first, then department head login code.
    let profileId: string | null = null;
    const { data: tm } = await admin
      .from("team_members")
      .select("profile_id")
      .eq("employee_id", id)
      .maybeSingle();
    profileId = tm?.profile_id ?? null;

    if (!profileId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("id")
        .eq("login_code", id)
        .maybeSingle();
      profileId = prof?.id ?? null;
    }

    if (!profileId) return null;
    const { data: userRes } = await admin.auth.admin.getUserById(profileId);
    return userRes?.user?.email ?? null;
  }
  return id.includes("@") ? id : null;
}

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
  const email = await resolveEmail(id);
  if (!email) {
    return {
      error: isEmployeeId
        ? "Invalid employee ID or password."
        : "Invalid email or password.",
    };
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

/**
 * Send a password-reset email. Accepts an employee ID or email. Always returns
 * a generic success so it can't be used to probe which accounts exist.
 */
export async function requestPasswordReset(
  identifier: string
): Promise<{ ok: true }> {
  const email = await resolveEmail(identifier);
  if (email) {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) {
      const origin = `${proto}://${host}`;
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
    }
  }
  return { ok: true };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
