import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// HR-only API for the application-form editor.
//   GET  -> the current form row (title, intro, thank-you, enabled, source,
//           slug, schema).
//   POST -> { action: "rotate" } regenerates the public share slug;
//           otherwise saves the form (title/intro/thankYou/enabled/
//           sourceLabel/questions).

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
    .from("recruitment_form")
    .select("slug, title, intro, thank_you, enabled, source_label, schema")
    .eq("id", "default")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ form: data });
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
  const supabase = createClient();

  if ((body as { action?: unknown })?.action === "rotate") {
    const { data, error } = await supabase.rpc("recruitment_rotate_slug");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, slug: data });
  }

  const b = (body ?? {}) as {
    title?: unknown;
    intro?: unknown;
    thankYou?: unknown;
    enabled?: unknown;
    sourceLabel?: unknown;
    questions?: unknown;
  };
  const questions = Array.isArray(b.questions) ? b.questions : [];

  const { error } = await supabase.rpc("recruitment_save_form", {
    p_title: typeof b.title === "string" ? b.title : null,
    p_intro: typeof b.intro === "string" ? b.intro : "",
    p_thank_you: typeof b.thankYou === "string" ? b.thankYou : null,
    p_enabled: typeof b.enabled === "boolean" ? b.enabled : true,
    p_source_label: typeof b.sourceLabel === "string" ? b.sourceLabel : null,
    p_schema: questions,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
