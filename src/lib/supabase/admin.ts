import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged, service-role Supabase client. SERVER ONLY.
 * Bypasses RLS — used for admin operations such as creating team-member /
 * department-head login accounts. Never import this into a Client Component.
 */
export function createAdminClient() {
  // Trim defensively — a stray space/newline pasted into the env var is a
  // common cause of Supabase "Invalid API key" errors.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment to manage user accounts."
    );
  }
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
