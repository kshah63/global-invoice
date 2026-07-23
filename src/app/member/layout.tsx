import { AppShell, type NavItem } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NAV: NavItem[] = [{ href: "/member", label: "Overview", exact: true }];

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("supplier_member");
  const supabase = createClient();
  const { data: member } = await supabase
    .from("supplier_members")
    .select("name")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (
    <AppShell
      role="supplier_member"
      displayName={member?.name ?? profile.full_name ?? profile.email}
      home="/member"
      nav={NAV}
    >
      {children}
    </AppShell>
  );
}
