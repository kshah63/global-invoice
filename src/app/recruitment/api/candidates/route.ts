import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Storage endpoints for the embedded recruitment (TalentFlow) app. The app
// loads all candidates (GET) and saves the whole set (POST) via replace-all.
// HR-only; a non-HR / signed-out caller gets 401 (never a redirect, so the
// embedded app's fetch can handle it cleanly).

async function requireHr() {
  const session = await getSession();
  if (!session || session.profile.role !== "hr") return false;
  return true;
}

export async function GET() {
  if (!(await requireHr())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recruitment_candidates")
    .select("data")
    .order("updated_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    candidates: ((data as { data: unknown }[]) ?? []).map((r) => r.data),
  });
}

export async function POST(req: Request) {
  if (!(await requireHr())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const raw = (body as { candidates?: unknown })?.candidates;
  const candidates = Array.isArray(raw) ? raw : [];

  const supabase = createClient();
  const { error } = await supabase.rpc("recruitment_save_all", {
    p_candidates: candidates,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
