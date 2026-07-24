import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("hr");
  const supabase = createClient();

  // Unread = any conversation whose latest message is from the participant and
  // arrived after HR last read it.
  const { data: convs } = await supabase
    .from("conversations")
    .select("last_message_from_hr, last_message_at, hr_last_read_at");
  const hasUnread = (
    (convs as
      | { last_message_from_hr: boolean; last_message_at: string; hr_last_read_at: string | null }[]
      | null) ?? []
  ).some(
    (c) => !c.last_message_from_hr && (!c.hr_last_read_at || c.last_message_at > c.hr_last_read_at)
  );

  const nav: NavItem[] = [
    { href: "/hr", label: "Dashboard", exact: true },
    { href: "/hr/team-members", label: "People" },
    { href: "/hr/invoices", label: "Invoices" },
    { href: "/hr/periods", label: "Periods" },
    { href: "/hr/inbox", label: "Inbox", badge: hasUnread },
    { href: "/hr/messages", label: "Broadcast" },
    { href: "/hr/reports", label: "Reports" },
    { href: "/hr/settings", label: "Settings" },
  ];

  return (
    <AppShell role="hr" displayName={profile.full_name ?? profile.email} home="/hr" nav={nav}>
      {children}
    </AppShell>
  );
}
