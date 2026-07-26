"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  label,
  exact,
  badge,
}: {
  href: string;
  label: string;
  exact?: boolean;
  badge?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
        active
          ? "bg-brand-600 text-white shadow-card"
          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
      )}
    >
      {label}
      {badge && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-400 ring-2 ring-white" />
      )}
    </Link>
  );
}
