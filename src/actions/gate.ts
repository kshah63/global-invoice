"use server";

import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
import {
  GO_GATE_COOKIE,
  globalOnlineToken,
  verifyGlobalOnlinePassword,
} from "@/lib/gate";

export async function unlockGlobalOnline(
  password: string
): Promise<{ error?: string }> {
  await requireRole("hr");

  if (!verifyGlobalOnlinePassword(password)) {
    return { error: "Incorrect password." };
  }
  const token = globalOnlineToken();
  if (token) {
    cookies().set(GO_GATE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // re-prompt after 12 hours
    });
  }
  return {};
}
