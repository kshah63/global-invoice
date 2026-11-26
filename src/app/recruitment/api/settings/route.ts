import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Key/value settings for the embedded recruitment (TalentFlow) app — small,
// HR-only, app-owned config (e.g. the daily-report WhatsApp recipient number).
// GET returns every setting as { settings: { key: value } }; POST upserts one
// { key, value }. HR-only; a non-HR / signed-out caller gets 401 (never a
// redirect, so the embedded app's fetch can handle it cleanly).

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
    .from("recruitment_settings")
    .select("key, value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const settings: Record<string, unknown> = {};
  for (const row of (data as { key: string; value: unknown }[]) ?? []) {
    settings[row.key] = row.value;
  }
  return NextResponse.json({ settings });
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
  const key = (body as { key?: unknown })?.key;
  const value = (body as { value?: unknown })?.value ?? null;
  if (typeof key !== "string" || key.trim() === "") {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("recruitment_set_setting", {
    p_key: key,
    p_value: value,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
