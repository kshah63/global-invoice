import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myUnread } from "@/actions/direct-messages";

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();
  const [{ data: tm }, unread] = await Promise.all([
    supabase.from("team_members").select("name").eq("profile_id", profile.id).maybeSingle(),
    myUnread(),
  ]);

  const nav: NavItem[] = [
    { href: "/team", label: "Overview", exact: true },
    { href: "/team/invoices", label: "My Invoices" },
    { href: "/messages", label: "Messages", badge: unread },
    { href: "/team/profile", label: "Profile" },
  ];

  return (
    <AppShell
      role="team_member"
      displayName={tm?.name ?? profile.full_name ?? profile.email}
      home="/team"
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
