import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { globalOnlineUnlocked } from "@/lib/gate";
import { GlobalOnlineGate } from "@/components/GlobalOnlineGate";

export const metadata = { title: "Global Online" };

export default async function GlobalOnlineGatePage() {
  await requireRole("hr");
  // Already unlocked (or the gate isn't configured) — go straight in.
  if (globalOnlineUnlocked()) redirect("/hr");
  return <GlobalOnlineGate />;
}
