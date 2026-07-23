import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/hr", label: "Dashboard", exact: true },
  { href: "/hr/team-members", label: "People" },
  { href: "/hr/invoices", label: "Invoices" },
  { href: "/hr/periods", label: "Periods" },
  { href: "/hr/messages", label: "Messages" },
  { href: "/hr/reports", label: "Reports" },
  { href: "/hr/settings", label: "Settings" },
];

export default async function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("hr");
  return (
    <AppShell
      role="hr"
      displayName={profile.full_name ?? profile.email}
      home="/hr"
      nav={NAV}
    >
      {children}
    </AppShell>
  );
}
