import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { signOut } from "@/actions/auth";
import { BrandWordmark } from "@/components/BrandMark";

export const metadata = { title: "Home" };

export default async function HubPage() {
  const { profile } = await requireRole("hr");
  const firstName = (profile.full_name ?? "").split(" ")[0];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/85 shadow-[0_1px_0_rgba(22,28,37,0.04)] backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <BrandWordmark />
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              Account
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="mv-rule" />
      </header>

      <main className="app-container py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold text-ink-900">
            Welcome{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-500">Choose an area to work in.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link
              href="/global-online"
              className="group rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="text-lg font-semibold text-ink-900 group-hover:text-brand-700">
                Global Online
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Invoicing, people, reports, cross-checks and timesheets.
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-brand-600">
                Open →
              </span>
            </Link>

            <Link
              href="/recruitment"
              className="group rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="text-lg font-semibold text-ink-900 group-hover:text-brand-700">
                Recruitment
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Track recruitment candidates and pipeline.
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-brand-600">
                Open →
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
