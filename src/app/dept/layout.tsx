import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/dept", label: "Overview", exact: true },
  { href: "/dept/checks", label: "Cross-checks" },
];

export default async function DeptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("department_head");
  return (
    <AppShell
      role="department_head"
      displayName={profile.full_name ?? profile.email}
      home="/dept"
      nav={NAV}
    >
      {children}
    </AppShell>
  );
}
