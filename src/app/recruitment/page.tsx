import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";

export const metadata = { title: "Recruitment" };

export default async function RecruitmentHome() {
  await requireRole("hr");

  return (
    <>
      <PageHeader
        title="Recruitment"
        description="Track recruitment. This area is being set up."
      />
      <Card>
        <CardBody className="py-16 text-center text-ink-500">
          Your recruitment module will live here. Share the code and I&apos;ll build it in
          under this area.
        </CardBody>
      </Card>
    </>
  );
}
