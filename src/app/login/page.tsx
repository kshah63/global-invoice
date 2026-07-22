import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";
import { BrandWordmark } from "@/components/BrandMark";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.profile.role] ?? "/");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="brand-mesh relative hidden flex-col justify-between p-12 lg:flex">
        <BrandWordmark invert />
        <div className="max-w-md">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-white">
            One place for the Global Online team to invoice with confidence.
          </h1>
          <p className="mt-4 text-brand-100">
            Track your sessions and hours through the month, submit a clean,
            consistent invoice, and always know exactly where it stands.
          </p>
        </div>
        <p className="text-sm text-brand-200/80">
          MathVision · StudyHub — Global Online tutoring
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandWordmark />
          </div>
          <h2 className="text-2xl font-semibold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">
            Use the credentials provided by your HR team.
          </p>
          <div className="mt-6">
            <LoginForm next={searchParams.next} />
          </div>
          <p className="mt-4 text-sm text-ink-500">
            <Link href="/forgot-password" className="text-brand-600 hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
