import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { myUnread } from "@/actions/direct-messages";

export default async function DeptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("department_head");
  const unread = await myUnread();

  const nav: NavItem[] = [
    { href: "/dept", label: "Overview", exact: true },
    { href: "/dept/checks", label: "Cross-checks" },
    { href: "/messages", label: "Messages", badge: unread },
  ];

  return (
    <AppShell
      role="department_head"
      displayName={profile.full_name ?? profile.email}
      home="/dept"
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
