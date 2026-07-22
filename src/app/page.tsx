import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(ROLE_HOME[session.profile.role] ?? "/login");
}
