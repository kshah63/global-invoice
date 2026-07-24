import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myUnread } from "@/actions/direct-messages";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("supplier_member");
  const supabase = createClient();
  const [{ data: member }, unread] = await Promise.all([
    supabase.from("supplier_members").select("name").eq("profile_id", profile.id).maybeSingle(),
    myUnread(),
  ]);

  const nav: NavItem[] = [
    { href: "/member", label: "Overview", exact: true },
    { href: "/messages", label: "Messages", badge: unread },
  ];

  return (
    <AppShell
      role="supplier_member"
      displayName={member?.name ?? profile.full_name ?? profile.email}
      home="/member"
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
