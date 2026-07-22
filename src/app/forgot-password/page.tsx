import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";
import { BrandWordmark } from "@/components/BrandMark";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.profile.role] ?? "/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <BrandWordmark />
        <h2 className="mt-8 text-2xl font-semibold text-ink-900">
          Reset your password
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Enter your employee ID or email and we&apos;ll send you a reset link.
        </p>
        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-sm text-ink-500">
          <Link href="/login" className="text-brand-600 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
