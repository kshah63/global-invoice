import Link from "next/link";

/**
 * Lets HR/admin move between the two product areas without logging out.
 * Only rendered inside the HR-only areas (invoicing + recruitment).
 */
export function AreaSwitcher({ active }: { active: "global" | "recruitment" }) {
  const base = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";
  const on = "bg-brand-600 text-white";
  const off = "text-ink-600 hover:bg-ink-100";
  return (
    <div className="inline-flex rounded-xl border border-ink-200 bg-white p-0.5">
      <Link href="/global-online" className={`${base} ${active === "global" ? on : off}`}>
        Global Online
      </Link>
      <Link href="/recruitment" className={`${base} ${active === "recruitment" ? on : off}`}>
        Recruitment
      </Link>
    </div>
  );
}
