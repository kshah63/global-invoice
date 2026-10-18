import { createClient } from "@/lib/supabase/server";
import { TIMESHEET_TEST_LOGIN_IDS } from "@/lib/constants";
import type { Session } from "@/lib/auth";

/**
 * Whether the timesheet feature is enabled for this user. During testing it's
 * limited to the two test login IDs (plus HR, who gets the overview). A team
 * member's login ID is their employee_id; an in-charge's is their login_code.
 */
export async function timesheetEnabled(session: Session): Promise<boolean> {
  const { profile, user } = session;
  if (profile.role === "hr") return true;
  if (profile.role === "department_head") {
    return TIMESHEET_TEST_LOGIN_IDS.includes(profile.login_code ?? "");
  }
  if (profile.role === "team_member") {
    const supabase = createClient();
    const { data } = await supabase
      .from("team_members")
      .select("employee_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    return TIMESHEET_TEST_LOGIN_IDS.includes(
      ((data?.employee_id as string | null) ?? "") || "\u0000"
    );
  }
  return false;
}
