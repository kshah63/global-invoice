import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Handles the link from a password-reset (or other) email: exchanges the
 * one-time code for a session, then forwards to the target page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/reset-password";
  const next = nextParam.startsWith("/") ? nextParam : "/reset-password";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That reset link is invalid or has expired. Please request a new one.")}`
  );
}
