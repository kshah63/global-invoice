import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { signOut } from "@/actions/auth";
import { BrandWordmark } from "@/components/BrandMark";
import { AreaSwitcher } from "@/components/AreaSwitcher";

export default async function RecruitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("hr");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-2">
        <div className="flex items-center gap-4">
          <Link href="/hub" className="rounded-lg">
            <BrandWordmark />
          </Link>
          <AreaSwitcher active="recruitment" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/recruitment/form"
            className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Application form
          </Link>
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
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
