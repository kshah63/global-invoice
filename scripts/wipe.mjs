/**
 * Remove all demo/app data (and the demo auth users) so you can start clean
 * for production. Keeps the schema; empties the tables.
 *
 *   npm run db:wipe
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import dotenv from "dotenv";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALL = "00000000-0000-0000-0000-000000000000";

async function confirm() {
  if (process.argv.includes("--yes")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "This deletes ALL invoices, team members, checks, messages and every non-service auth user. Type 'wipe' to continue: ",
      (a) => {
        rl.close();
        resolve(a.trim().toLowerCase() === "wipe");
      }
    );
  });
}

async function main() {
  if (!(await confirm())) {
    console.log("Aborted.");
    return;
  }

  console.log("Wiping data…");
  // Child tables first (FKs mostly cascade, but be explicit).
  await admin.from("dept_head_check_items").delete().neq("id", ALL);
  await admin.from("dept_head_checks").delete().neq("id", ALL);
  await admin.from("invoice_line_items").delete().neq("id", ALL);
  await admin.from("invoices").delete().neq("id", ALL);
  await admin.from("team_member_rates").delete().neq("id", ALL);
  await admin.from("team_members").delete().neq("id", ALL);
  await admin.from("messages").delete().neq("id", ALL);
  await admin.from("invoice_periods").delete().neq("id", ALL);

  // Remove all auth users (their profiles cascade away). Delete in batches by
  // repeatedly draining the first page until no users remain.
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  // Reset company settings to default.
  await admin
    .from("company_settings")
    .upsert({ id: 1, company_name: "MathVision", address: null, email: null, phone: null, registration_no: null }, { onConflict: "id" });

  console.log("Done. The database is clean (schema intact).");
}

main().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
