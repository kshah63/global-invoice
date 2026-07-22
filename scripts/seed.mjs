/**
 * Seed the Global Online Invoicing App with demo accounts and data.
 *
 *   npm run db:seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (and optionally SEED_* credentials). Safe to re-run — it upserts.
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HR = {
  email: process.env.SEED_HR_EMAIL || "hr@mathvision.demo",
  password: process.env.SEED_HR_PASSWORD || "Password123!",
};
const TM = {
  email: process.env.SEED_TM_EMAIL || "teacher@mathvision.demo",
  password: process.env.SEED_TM_PASSWORD || "Password123!",
};
const DH = {
  email: process.env.SEED_DH_EMAIL || "head@mathvision.demo",
  password: process.env.SEED_DH_PASSWORD || "Password123!",
};

const pad2 = (n) => String(n).padStart(2, "0");
const invNo = (emp, y, m) => `INV-${emp}-${y}-${pad2(m)}`;

async function listAllUsers() {
  const all = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < 200) break;
    page++;
  }
  return all;
}

async function ensureUser(email, password, metadata) {
  const users = await listAllUsers();
  let user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: metadata,
      app_metadata: { role: metadata.role },
    });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { role: metadata.role },
    });
    if (error) throw error;
    user = data.user;
  }
  // Ensure the profile row exists/matches (trigger normally handles insert).
  await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      role: metadata.role,
      full_name: metadata.full_name ?? null,
      business: metadata.business ?? null,
    },
    { onConflict: "id" }
  );
  return user;
}

async function ensureTeamMember(profileId, fields, rates) {
  const { data: tm, error } = await admin
    .from("team_members")
    .upsert({ profile_id: profileId, use_hr_name: true, ...fields }, { onConflict: "employee_id" })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("team_member_rates").delete().eq("team_member_id", tm.id);
  if (rates.length) {
    await admin.from("team_member_rates").insert(
      rates.map((r, i) => ({ ...r, team_member_id: tm.id, sort_order: i }))
    );
  }
  return tm.id;
}

function statusTimestamps(status, y, m) {
  const base = `${y}-${pad2(m)}-28T10:00:00Z`;
  const ts = {};
  if (["submitted", "approved", "locked", "paid"].includes(status)) ts.submitted_at = base;
  if (["approved", "locked", "paid"].includes(status)) ts.approved_at = base;
  if (["locked", "paid"].includes(status)) ts.locked_at = base;
  if (status === "paid") ts.paid_at = `${y}-${pad2(m)}-30T10:00:00Z`;
  return ts;
}

async function ensureInvoice(meta, items) {
  const { data: inv, error } = await admin
    .from("invoices")
    .upsert(
      {
        team_member_id: meta.teamMemberId,
        period_year: meta.year,
        period_month: meta.month,
        invoice_number: invNo(meta.employeeId, meta.year, meta.month),
        status: meta.status,
        display_name: meta.displayName,
        ship_to_address: meta.shipTo,
        currency: meta.currency,
        company_snapshot: meta.company,
        tax_rate: meta.taxRate ?? 0,
        notes: meta.notes ?? null,
        ...statusTimestamps(meta.status, meta.year, meta.month),
      },
      { onConflict: "team_member_id,period_year,period_month" }
    )
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("invoice_line_items").delete().eq("invoice_id", inv.id);
  await admin.from("invoice_line_items").insert(
    items.map((it, i) => ({ ...it, invoice_id: inv.id, sort_order: i }))
  );
  return inv.id;
}

async function ensureCheck(createdBy, meta, items) {
  const { data: chk, error } = await admin
    .from("dept_head_checks")
    .upsert(
      {
        created_by: createdBy,
        team_member_id: meta.teamMemberId,
        period_year: meta.year,
        period_month: meta.month,
        business: meta.business,
        notes: meta.notes ?? null,
      },
      { onConflict: "created_by,team_member_id,period_year,period_month" }
    )
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("dept_head_check_items").delete().eq("check_id", chk.id);
  await admin.from("dept_head_check_items").insert(
    items.map((it, i) => ({ ...it, check_id: chk.id, sort_order: i }))
  );
  return chk.id;
}

async function main() {
  console.log("Seeding…");

  // Company settings
  const company = {
    company_name: "MathVision",
    address: "10 Anson Road, #12-34\nSingapore 079903",
    email: "accounts@mathvision.example",
    phone: "+65 6123 4567",
    registration_no: "201812345A",
  };
  await admin.from("company_settings").upsert({ id: 1, ...company }, { onConflict: "id" });

  // Users
  const hr = await ensureUser(HR.email, HR.password, { role: "hr", full_name: "Priya Nair" });
  const dh = await ensureUser(DH.email, DH.password, {
    role: "department_head",
    full_name: "David Chen",
    business: "MathVision",
  });
  const tm1User = await ensureUser(TM.email, TM.password, {
    role: "team_member",
    full_name: "Aisha Rahman",
  });
  const tm2User = await ensureUser("teacher2@mathvision.demo", TM.password, {
    role: "team_member",
    full_name: "Ravi Kumar",
  });
  const tm3User = await ensureUser("teacher3@mathvision.demo", TM.password, {
    role: "team_member",
    full_name: "Mei Ling",
  });

  // Team members
  const aisha = await ensureTeamMember(
    tm1User.id,
    {
      name: "Aisha Rahman",
      email: TM.email,
      employee_id: "1001",
      whatsapp_number: "+65 8123 4567",
      date_joined: "2023-04-01",
      nationality: "Singaporean",
      work_location: "Remote",
      head_of_department: "David Chen",
      payment_details: "PayNow: +65 8123 4567",
      currency: "SGD",
      ship_to_address: "88 Bukit Timah Road\nSingapore 229838",
      subjects: ["Algebra", "Calculus"],
    },
    [
      { descriptor: "Weekday teaching", unit: "per_hour", amount: 45, task: "teaching" },
      { descriptor: "Weekend teaching", unit: "per_hour", amount: 55, task: "teaching" },
      { descriptor: "Paper marking", unit: "per_session", amount: 20, task: "paper_marking" },
    ]
  );
  const ravi = await ensureTeamMember(
    tm2User.id,
    {
      name: "Ravi Kumar",
      email: "teacher2@mathvision.demo",
      employee_id: "1002",
      whatsapp_number: "+91 98765 43210",
      date_joined: "2022-09-15",
      nationality: "Indian",
      work_location: "Remote",
      head_of_department: "David Chen",
      payment_details: "Bank: HDFC ****1234",
      currency: "INR",
      ship_to_address: "12 MG Road\nBengaluru 560001",
      subjects: ["Geometry"],
    },
    [
      { descriptor: "Teaching (per session)", unit: "per_session", amount: 800, task: "teaching" },
      { descriptor: "Teacher training", unit: "per_hour", amount: 1200, task: "teacher_training" },
    ]
  );
  const mei = await ensureTeamMember(
    tm3User.id,
    {
      name: "Mei Ling",
      email: "teacher3@mathvision.demo",
      employee_id: "1003",
      whatsapp_number: "+60 12-345 6789",
      date_joined: "2024-01-10",
      nationality: "Malaysian",
      work_location: "Remote",
      head_of_department: "David Chen",
      payment_details: "Maybank ****5678",
      currency: "MYR",
      ship_to_address: "5 Jalan Ampang\n50450 Kuala Lumpur",
      fixed_salary: 3000,
      subjects: ["Statistics"],
    },
    [{ descriptor: "Teaching", unit: "per_hour", amount: 90, task: "teaching" }]
  );

  // Periods (current + previous)
  const Y = 2026;
  for (const m of [6, 7]) {
    await admin
      .from("invoice_periods")
      .upsert({ year: Y, month: m, is_open: true, opened_by: hr.id, opened_at: `${Y}-${pad2(m)}-01T09:00:00Z` }, { onConflict: "year,month" });
  }

  // Invoices
  await ensureInvoice(
    {
      teamMemberId: aisha,
      employeeId: "1001",
      year: Y,
      month: 7,
      status: "draft",
      displayName: "Aisha Rahman",
      shipTo: "88 Bukit Timah Road\nSingapore 229838",
      currency: "SGD",
      company,
      taxRate: 9,
      notes: "Includes weekday classes and July paper marking.",
    },
    [
      { centre: "MathVision", task: "teaching", note: "Weekday classes", sessions: 10, hours: 20, rate_descriptor: "Weekday teaching", rate_unit: "per_hour", rate_amount: 45 },
      { centre: "MathVision", task: "paper_marking", note: "July papers", sessions: 15, hours: 0, rate_descriptor: "Paper marking", rate_unit: "per_session", rate_amount: 20 },
    ]
  );

  await ensureInvoice(
    {
      teamMemberId: aisha,
      employeeId: "1001",
      year: Y,
      month: 6,
      status: "locked",
      displayName: "Aisha Rahman",
      shipTo: "88 Bukit Timah Road\nSingapore 229838",
      currency: "SGD",
      company,
      taxRate: 9,
    },
    [
      { centre: "MathVision", task: "teaching", note: "Weekday classes", sessions: 8, hours: 16, rate_descriptor: "Weekday teaching", rate_unit: "per_hour", rate_amount: 45 },
    ]
  );

  await ensureInvoice(
    {
      teamMemberId: ravi,
      employeeId: "1002",
      year: Y,
      month: 6,
      status: "paid",
      displayName: "Ravi Kumar",
      shipTo: "12 MG Road\nBengaluru 560001",
      currency: "INR",
      company,
      taxRate: 18,
    },
    [
      { centre: "StudyHub", task: "teaching", note: "Batch A", sessions: 12, hours: 24, rate_descriptor: "Teaching (per session)", rate_unit: "per_session", rate_amount: 800 },
      { centre: "StudyHub", task: "teacher_training", note: "New tutor onboarding", sessions: 0, hours: 3, rate_descriptor: "Teacher training", rate_unit: "per_hour", rate_amount: 1200 },
    ]
  );

  await ensureInvoice(
    {
      teamMemberId: mei,
      employeeId: "1003",
      year: Y,
      month: 7,
      status: "submitted",
      displayName: "Mei Ling",
      shipTo: "5 Jalan Ampang\n50450 Kuala Lumpur",
      currency: "MYR",
      company,
      taxRate: 0,
    },
    [
      { centre: "MathVision", task: "fixed_salary", note: "Monthly retainer", sessions: 0, hours: 0, rate_descriptor: "Fixed salary", rate_unit: "fixed", rate_amount: 3000 },
    ]
  );

  // Department head cross-check for Aisha (July) — small mismatch to demo the comparison
  await ensureCheck(
    dh.id,
    { teamMemberId: aisha, year: Y, month: 7, business: "MathVision", notes: "Verified against the attendance register." },
    [
      { task: "teaching", note: "Weekday classes", sessions: 10, hours: 20 },
      { task: "paper_marking", note: "Papers received", sessions: 14, hours: 0 },
    ]
  );

  // Broadcast message (idempotent: clear any prior seed message first)
  const seedSubject = "Invoicing is open for July 2026";
  await admin.from("messages").delete().eq("subject", seedSubject);
  await admin.from("messages").insert({
    sender_profile_id: hr.id,
    sender_name: "Priya Nair",
    subject: "Invoicing is open for July 2026",
    body:
      "Hi team,\n\nInvoicing for July is now open. Please complete and submit your invoice by the end of the month.\n\nThank you!",
    period_year: Y,
    period_month: 7,
  });

  console.log("\nSeed complete. Demo logins:");
  console.log(`  HR:              ${HR.email} / ${HR.password}`);
  console.log(`  Team Member:     ${TM.email} / ${TM.password}`);
  console.log(`  Department Head: ${DH.email} / ${DH.password}`);
  console.log("  (extra teachers: teacher2@mathvision.demo, teacher3@mathvision.demo)\n");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
