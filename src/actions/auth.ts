"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve a login identifier to an email. Anything with "@" is an email;
 * otherwise it's a login code — a team member's employee ID, a roster member's
 * code, a department head's login code (4–6 alphanumeric), or a supplier's
 * code. Alphanumeric codes are matched case-insensitively.
 */
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (!id) return null;
  if (id.includes("@")) return id;

  const admin = createAdminClient();
  const up = id.toUpperCase();

  // Team member employee ID, then roster member code (both numeric).
  let profileId: string | null = null;
  const { data: tm } = await admin
    .from("team_members")
    .select("profile_id")
    .eq("employee_id", id)
    .maybeSingle();
  profileId = tm?.profile_id ?? null;

  if (!profileId) {
    const { data: sm } = await admin
      .from("supplier_members")
      .select("profile_id")
      .eq("code", id)
      .maybeSingle();
    profileId = sm?.profile_id ?? null;
  }

  // Department-head login code (stored upper-cased).
  if (!profileId) {
    const { data: prof } = await admin
      .from("profiles")
      .select("id")
      .in("login_code", [id, up])
      .maybeSingle();
    profileId = prof?.id ?? null;
  }

  if (profileId) {
    const { data: userRes } = await admin.auth.admin.getUserById(profileId);
    return userRes?.user?.email ?? null;
  }

  // Otherwise it may be a supplier code (the leader logs in with it).
  const { data: sup } = await admin
    .from("team_members")
    .select("profile_id")
    .eq("member_type", "supplier")
    .in("supplier_code", [id, up])
    .maybeSingle();
  if (sup?.profile_id) {
    const { data: userRes } = await admin.auth.admin.getUserById(sup.profile_id);
    return userRes?.user?.email ?? null;
  }
  return null;
}

/**
 * Sign in with either an email (HR, or anyone who has one) or a login ID / code.
 * The identifier is resolved server-side to the account's login email; errors
 * are intentionally generic to avoid revealing which IDs / emails exist.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string
): Promise<{ error?: string }> {
  const id = identifier.trim();
  if (!id || !password) return { error: "Enter your ID or email and your password." };

  const isEmail = id.includes("@");
  const genericError = isEmail
    ? "Invalid email or password."
    : "Invalid ID or password.";

  const email = await resolveEmail(id);
  if (!email) return { error: genericError };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: genericError };
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
