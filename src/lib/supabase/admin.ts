import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged, service-role Supabase client. SERVER ONLY.
 * Bypasses RLS — used for admin operations such as creating team-member /
 * department-head login accounts. Never import this into a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment to manage user accounts."
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
