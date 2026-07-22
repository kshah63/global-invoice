import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NAV: NavItem[] = [
  { href: "/team", label: "Overview", exact: true },
  { href: "/team/invoices", label: "My Invoices" },
  { href: "/team/profile", label: "Profile" },
];

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();
  const { data: tm } = await supabase
    .from("team_members")
    .select("name")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (
    <AppShell
      role="team_member"
      displayName={tm?.name ?? profile.full_name ?? profile.email}
      home="/team"
      nav={NAV}
    >
      {children}
    </AppShell>
  );
}
