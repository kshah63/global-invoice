import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { TeamMemberForm } from "@/components/hr/TeamMemberForm";

export const metadata = { title: "Add Team Member" };

export default async function NewTeamMember() {
  await requireRole("hr");
  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← Team members
        </Link>
      </div>
      <PageHeader
        title="Add team member"
        description="Creates their login and profile. These details auto-populate their invoices."
      />
      <TeamMemberForm mode="create" />
    </>
  );
}
