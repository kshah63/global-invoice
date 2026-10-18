import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myUnread } from "@/actions/direct-messages";
import { TIMESHEET_TEST_LOGIN_IDS } from "@/lib/constants";

export default async function DeptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("department_head");
  const unread = await myUnread();

  const timesheetOn = TIMESHEET_TEST_LOGIN_IDS.includes(profile.login_code ?? "");
  let timesheetBadge = false;
  if (timesheetOn) {
    const supabase = createClient();
    const { count } = await supabase
      .from("timesheet_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review");
    timesheetBadge = (count ?? 0) > 0;
  }

  const nav: NavItem[] = [
    { href: "/dept", label: "Overview", exact: true },
    { href: "/dept/checks", label: "Cross-checks" },
    ...(timesheetOn
      ? [{ href: "/dept/timesheet", label: "Timesheet", badge: timesheetBadge }]
      : []),
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
