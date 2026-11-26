import { requireRole } from "@/lib/auth";

export const metadata = { title: "Recruitment" };

export default async function RecruitmentHome() {
  await requireRole("hr");
  // The TalentFlow app is a self-contained HTML tool served from /public. It
  // persists candidates to Supabase via /recruitment/api/candidates. Embedding
  // it same-origin means its fetches carry the HR login session.
  return (
    <iframe
      src="/talentflow.html"
      title="Recruitment — TalentFlow"
      className="h-full w-full border-0"
    />
  );
}
