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
        {/* The month, then the invoice — a calendar and a line-item document
            drawn large and faint, the two halves of what this tool does. */}
        <svg
          viewBox="0 0 220 220"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -right-6 h-[460px] w-[460px] opacity-[0.15]"
        >
          {/* Calendar — the month, with a few sessions marked */}
          <g stroke="white" strokeLinecap="round">
            <path d="M40 18 V30 M100 18 V30" strokeWidth="2" />
            <rect x="20" y="24" width="100" height="92" rx="9" strokeWidth="2" />
            <path d="M20 46 H120" strokeWidth="1.5" />
          </g>
          {[62, 80, 98].map((cy) =>
            [34, 52, 70, 88, 106].map((cx) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" stroke="white" strokeWidth="1.5" />
            ))
          )}
          <circle cx="52" cy="62" r="3" fill="white" stroke="none" />
          <circle cx="88" cy="80" r="3" fill="white" stroke="none" />
          <circle cx="70" cy="98" r="3" fill="white" stroke="none" />
          <circle cx="106" cy="62" r="3.4" fill="#f05a2b" stroke="none" />

          {/* Invoice — the line items and a highlighted total */}
          <rect x="104" y="78" width="100" height="124" rx="10" fill="#1a1c46" stroke="white" strokeWidth="2" />
          <g stroke="white" strokeLinecap="round">
            <path d="M118 98 H170" strokeWidth="3" />
            <path d="M118 108 H152" strokeWidth="2" opacity="0.6" />
            <path d="M118 126 H164 M178 126 H190" strokeWidth="2" opacity="0.85" />
            <path d="M118 140 H164 M178 140 H190" strokeWidth="2" opacity="0.85" />
            <path d="M118 154 H164 M178 154 H190" strokeWidth="2" opacity="0.85" />
            <path d="M118 170 H190" strokeWidth="1.5" opacity="0.5" />
            <path d="M118 184 H146" strokeWidth="3" />
          </g>
          <rect x="168" y="179" width="22" height="9" rx="2" fill="#f05a2b" />
        </svg>

        <div className="relative animate-fade-in">
          <BrandWordmark invert />
        </div>

        <div className="relative max-w-md">
          <div
            className="mv-eyebrow animate-fade-in text-gold-300"
            style={{ animationDelay: "80ms" }}
          >
            Invoicing for the Global Online team
          </div>
          <p
            className="mt-5 animate-fade-in font-serif text-[1.95rem] font-medium leading-[1.3] text-white"
            style={{ animationDelay: "140ms" }}
          >
            Track <span className="font-semibold">your time</span> through the
            month, submit a{" "}
            <span className="text-gold-300">clean, consistent invoice</span>, and
            always know exactly where it stands.
          </p>
          <div
            className="mv-rule mt-7 w-24 animate-fade-in rounded-full"
            style={{ animationDelay: "220ms" }}
          />
          <div
            className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 animate-fade-in text-sm font-medium text-brand-100"
            style={{ animationDelay: "280ms" }}
          >
            <span>Log your time</span>
            <span aria-hidden className="text-gold-300">
              →
            </span>
            <span>Submit your invoice</span>
            <span aria-hidden className="text-gold-300">
              →
            </span>
            <span>Get paid</span>
          </div>
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
