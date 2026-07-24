import Link from "next/link";
import { signOut } from "@/actions/auth";
import { BrandWordmark } from "@/components/BrandMark";
import { NavLink } from "@/components/NavLink";
import { Avatar } from "@/components/ui/Avatar";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  badge?: boolean;
}

export function AppShell({
  role,
  displayName,
  home,
  nav,
  children,
}: {
  role: Role;
  displayName: string;
  home: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <Link href={home} className="rounded-lg">
            <BrandWordmark />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight text-ink-800">
                {displayName}
              </div>
              <div className="text-xs text-ink-500">{ROLE_LABELS[role]}</div>
            </div>
            <Avatar name={displayName} />
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
        <div className="app-container">
          <nav className="flex gap-1 overflow-x-auto pb-2">
            {nav.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
        </div>
      </header>
      <main className="app-container py-8">{children}</main>
    </div>
  );
}

/** Simple page heading used across sections. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
