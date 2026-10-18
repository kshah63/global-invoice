import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myUnread } from "@/actions/direct-messages";
import { TIMESHEET_TEST_LOGIN_IDS } from "@/lib/constants";

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("team_member");
  const supabase = createClient();
  const [{ data: tm }, unread] = await Promise.all([
    supabase
      .from("team_members")
      .select("name, member_type, employee_id")
      .eq("profile_id", profile.id)
      .maybeSingle(),
    myUnread(),
  ]);

  const isSupplier = tm?.member_type === "supplier";
  const timesheetOn = TIMESHEET_TEST_LOGIN_IDS.includes((tm?.employee_id as string | null) ?? "");
  let timesheetBadge = false;
  if (timesheetOn) {
    const { count } = await supabase
      .from("timesheet_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_acceptance");
    timesheetBadge = (count ?? 0) > 0;
  }

  const nav: NavItem[] = [
    { href: "/team", label: "Overview", exact: true },
    { href: "/team/invoices", label: "My Invoices" },
    // Supplier leaders get a standing reference of their roster.
    ...(isSupplier ? [{ href: "/team/roster", label: "Roster" }] : []),
    ...(timesheetOn
      ? [{ href: "/team/timesheet", label: "Timesheet", badge: timesheetBadge }]
      : []),
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
