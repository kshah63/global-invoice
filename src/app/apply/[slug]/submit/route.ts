import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  effectiveForm,
  buildCandidateData,
  validateSubmission,
  type ApplicationFormRow,
} from "@/lib/recruitmentForm";

// Public, unauthenticated endpoint: an applicant submits the form at
// /apply/<slug>. Uses the service-role client (tightly scoped here: read the
// form by slug, insert one submission) so no anonymous DB grants are needed.
// Submissions land in recruitment_submissions; the HR candidates GET absorbs
// them onto the board.

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const admin = createAdminClient();

  const { data: row, error: rowErr } = await admin
    .from("recruitment_form")
    .select("slug, title, intro, thank_you, enabled, source_label, schema")
    .eq("slug", params.slug)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!row || row.enabled === false) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  // Honeypot: a hidden field real users never see. If it's filled, pretend
  // success and drop silently.
  const hp = (body as { hp?: unknown })?.hp;
  if (typeof hp === "string" && hp.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const rawAnswers = (body as { answers?: unknown })?.answers;
  const answers: Record<string, unknown> =
    rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, unknown>)
      : {};

  // Size guard against abuse.
  if (JSON.stringify(answers).length > 20000) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const form = effectiveForm(row as ApplicationFormRow);
  const missing = validateSubmission(form.questions, answers);
  if (missing.length > 0) {
    return NextResponse.json({ error: "missing", fields: missing }, { status: 400 });
  }

  const candidate = buildCandidateData(form, answers);
  const { error } = await admin.from("recruitment_submissions").insert({
    id: candidate.id as string,
    data: candidate,
    answers,
    source: form.sourceLabel,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
