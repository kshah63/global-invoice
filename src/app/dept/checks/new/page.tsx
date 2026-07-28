import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/AppShell";
import { Alert } from "@/components/ui/Feedback";
import { MultiCheckEditor } from "@/components/dept/MultiCheckEditor";
import type { Centre } from "@/lib/constants";
import type { TeamMember } from "@/lib/types";

export const metadata = { title: "New Cross-check" };

export default async function NewCheck() {
  const { profile } = await requireRole("department_head");
  const supabase = createClient();
  const { data } = await supabase.rpc("list_team_members_for_dept");
  const members = (data as Pick<TeamMember, "id" | "name" | "employee_id">[]) ?? [];

  return (
    <>
      <div className="mb-4">
        <Link href="/dept/checks" className="text-sm text-brand-600 hover:underline">
          ← Cross-checks
        </Link>
      </div>
      <PageHeader
        title="New cross-check"
        description="Pick the month once, then add each individual with their sessions and hours."
      />
      {members.length === 0 ? (
        <Alert tone="warning">
          There are no active team members to report on yet.
        </Alert>
      ) : (
        <MultiCheckEditor
          teamMembers={members}
          defaultBusiness={(profile.business as Centre) ?? "MathVision"}
        />
      )}
    </>
  );
}
