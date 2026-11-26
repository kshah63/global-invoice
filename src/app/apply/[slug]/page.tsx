import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveForm, type ApplicationFormRow } from "@/lib/recruitmentForm";
import { ApplyForm } from "@/components/apply/ApplyForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application — MathVision" };

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
          MV
        </div>
        <h1 className="text-lg font-semibold text-ink-900">
          This application form isn’t available
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          The link may have been turned off or is no longer valid. Please get in
          touch with the MathVision team for an up-to-date link.
        </p>
      </div>
    </main>
  );
}

export default async function ApplyPage({
  params,
}: {
  params: { slug: string };
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("recruitment_form")
    .select("slug, title, intro, thank_you, enabled, source_label, schema")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!data || data.enabled === false) {
    return <Unavailable />;
  }

  const form = effectiveForm(data as ApplicationFormRow);
  return <ApplyForm form={form} />;
}
