import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { AreaSwitcher } from "@/components/AreaSwitcher";

export default async function RecruitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("hr");

  const nav: NavItem[] = [{ href: "/recruitment", label: "Overview", exact: true }];

  return (
    <AppShell
      role="hr"
      displayName={profile.full_name ?? profile.email}
      home="/hub"
      nav={nav}
      switcher={<AreaSwitcher active="recruitment" />}
    >
      {children}
    </AppShell>
  );
}
