import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { SupplierDetailsForm } from "@/components/hr/SupplierDetailsForm";

export const metadata = { title: "Add Supplier" };

export default async function NewSupplier() {
  await requireRole("hr");
  return (
    <>
      <div className="mb-4">
        <Link href="/hr/team-members" className="text-sm text-brand-600 hover:underline">
          ← People
        </Link>
      </div>
      <PageHeader
        title="Add supplier"
        description="A business whose leader logs in and invoices for several people. You'll add its people after creating it."
      />
      <SupplierDetailsForm mode="create" />
    </>
  );
}
