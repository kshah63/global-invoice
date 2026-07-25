import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { DeptHeadForm } from "@/components/hr/DeptHeadForm";

export const metadata = { title: "Add Department Head" };

export default async function NewDepartmentHead() {
  await requireRole("hr");
  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← People
        </Link>
      </div>
      <PageHeader
        title="Add department head"
        description="Creates their login. They sign in with their Login ID (or email) and submit session/hour cross-checks."
      />
      <Card>
        <CardBody>
          <DeptHeadForm />
        </CardBody>
      </Card>
    </>
  );
}
