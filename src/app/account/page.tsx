import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/constants";
import { BrandWordmark } from "@/components/BrandMark";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { profile } = await requireUser();
  const home = ROLE_HOME[profile.role] ?? "/";

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="app-container flex h-16 items-center justify-between">
          <Link href={home} className="rounded-lg">
            <BrandWordmark />
          </Link>
          <Link href={home} className="text-sm text-brand-600 hover:underline">
            ← Back
          </Link>
        </div>
      </header>

      <div className="app-container max-w-xl py-8">
        <h1 className="text-2xl font-semibold text-ink-900">Account</h1>
        <p className="mt-1 text-sm text-ink-500">
          {profile.email} · {ROLE_LABELS[profile.role]}
        </p>

        <Card className="mt-6">
          <CardHeader
            title="Change password"
            description="Update the password you use to sign in."
          />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
