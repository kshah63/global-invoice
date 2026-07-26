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
      <div className="brand-mesh relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        {/* Heavier grid lines for depth */}
        <div className="brand-mesh-major pointer-events-none absolute inset-0" />
        {/* A plotted, rising curve — MathVision's motif drawn large and faint */}
        <svg
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-4 h-[440px] w-[440px] opacity-[0.14]"
        >
          <path d="M24 176 V20 M24 176 H184" stroke="white" strokeWidth="1.5" />
          <path
            d="M24 168 C58 156 74 104 104 92 C132 80 150 52 184 26"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="104" cy="92" r="4.5" fill="white" />
          <circle cx="184" cy="26" r="7" fill="#f05a2b" />
        </svg>

        <div className="relative animate-fade-in">
          <BrandWordmark invert />
        </div>

        <div className="relative max-w-md">
          <div
            className="mv-eyebrow animate-fade-in text-gold-300"
            style={{ animationDelay: "80ms" }}
          >
            For the Global Online team
          </div>
          <h1
            className="mt-4 animate-fade-in font-serif text-[2.75rem] font-semibold leading-[1.05] text-white"
            style={{ animationDelay: "140ms" }}
          >
            Invoice with <span className="text-gold-300">confidence</span>, month
            after month.
          </h1>
          <div
            className="mv-rule mt-6 w-24 animate-fade-in rounded-full"
            style={{ animationDelay: "200ms" }}
          />
          <p
            className="mt-6 animate-fade-in text-brand-100"
            style={{ animationDelay: "260ms" }}
          >
            Track your sessions and hours through the month, submit a clean,
            consistent invoice, and always know exactly where it stands.
          </p>
        </div>

        <p
          className="relative animate-fade-in text-sm text-brand-200/80"
          style={{ animationDelay: "320ms" }}
        >
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
