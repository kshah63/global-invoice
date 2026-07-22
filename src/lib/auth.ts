import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type Role } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export interface Session {
  user: User;
  profile: Profile;
}

/**
 * Current authenticated user + profile, or null. Memoised per request so
 * multiple calls in one render don't hit Supabase repeatedly.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { user, profile: profile as Profile };
});

/** Require a logged-in user; redirect to /login otherwise. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Require a specific role (or one of several); redirect appropriately. */
export async function requireRole(role: Role | Role[]): Promise<Session> {
  const session = await requireUser();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(session.profile.role)) {
    redirect(ROLE_HOME[session.profile.role] ?? "/login");
  }
  return session;
}
