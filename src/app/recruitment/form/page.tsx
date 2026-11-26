import { headers } from "next/headers";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveForm,
  DEFAULT_QUESTIONS,
  type ApplicationFormRow,
} from "@/lib/recruitmentForm";
import { FormEditor } from "@/components/recruitment/FormEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application form" };

export default async function RecruitmentFormPage() {
  await requireRole("hr");

  const supabase = createClient();
  const { data } = await supabase
    .from("recruitment_form")
    .select("slug, title, intro, thank_you, enabled, source_label, schema")
    .eq("id", "default")
    .maybeSingle();

  const form = data
    ? effectiveForm(data as ApplicationFormRow)
    : {
        slug: "",
        title: "MathVision Application Form",
        intro: "",
        thankYou: "Thank you! Your application has been received.",
        enabled: true,
        sourceLabel: "Supreme HR",
        questions: DEFAULT_QUESTIONS,
      };

  const h = headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return <FormEditor initialForm={form} origin={origin} />;
}
