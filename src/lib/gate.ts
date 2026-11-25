import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * A temporary shared-password gate for the Global Online (invoicing) section.
 * Any HR/admin can reach the hub, but only those who know this password can
 * enter /hr/*. This is a stopgap until proper per-user permissions exist.
 *
 * The password lives in the GLOBAL_ONLINE_GATE_PASSWORD env var (never sent to
 * the client). When it's unset the gate is OFF, so deploying this code can't
 * lock anyone out before the password is configured.
 */

export const GO_GATE_COOKIE = "go_gate";

function gatePassword(): string | null {
  const pw = process.env.GLOBAL_ONLINE_GATE_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

export function globalOnlineGateEnabled(): boolean {
  return gatePassword() !== null;
}

/** The cookie value we expect for an unlocked session (a non-reversible hash of
 * the password, so it can't be forged without knowing the password). */
export function globalOnlineToken(): string | null {
  const pw = gatePassword();
  if (!pw) return null;
  return createHash("sha256").update(`go-gate:v1:${pw}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** True when the gate is off, or the current request carries a valid cookie. */
export function globalOnlineUnlocked(): boolean {
  const expected = globalOnlineToken();
  if (expected === null) return true; // gate disabled
  const got = cookies().get(GO_GATE_COOKIE)?.value ?? "";
  return safeEqual(got, expected);
}

export function verifyGlobalOnlinePassword(input: string): boolean {
  const pw = gatePassword();
  if (!pw) return true;
  return safeEqual(input, pw);
}
