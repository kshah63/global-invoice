/**
 * Domain constants — the single source of truth for the enumerations used across
 * the UI and validated against the database enums in the SQL migrations.
 */

export const ROLES = ["hr", "team_member", "department_head"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  hr: "HR",
  team_member: "Team Member",
  department_head: "Department Head",
};

/** Home route per role — used for post-login routing. */
export const ROLE_HOME: Record<Role, string> = {
  hr: "/hr",
  team_member: "/team",
  department_head: "/dept",
};

// --- Subjects -------------------------------------------------------------

export const SUBJECT_OPTIONS = [
  "1 - 8 Maths",
  "9 - 10 Maths",
  "11 - 12 Maths",
  "9 - 10 Science",
  "11 - 12 Science",
  "Economics",
  "Business",
  "Computer Science",
] as const;

// --- Currencies -----------------------------------------------------------

export const CURRENCIES = ["SGD", "INR", "MYR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<
  Currency,
  { label: string; symbol: string; locale: string }
> = {
  SGD: { label: "Singapore Dollar", symbol: "S$", locale: "en-SG" },
  INR: { label: "Indian Rupee", symbol: "₹", locale: "en-IN" },
  MYR: { label: "Malaysian Ringgit", symbol: "RM", locale: "en-MY" },
};

// --- Centres (businesses) -------------------------------------------------

export const CENTRES = ["MathVision", "StudyHub"] as const;
export type Centre = (typeof CENTRES)[number];

// --- Tasks ----------------------------------------------------------------

// Individual (team member) tasks
export const TASKS = [
  "teaching",
  "teacher_training",
  "paper_marking",
  "fixed_salary",
] as const;

// Supplier tasks (no fixed salary; adds consultancy/ambassador/admin/misc)
export const SUPPLIER_TASKS = [
  "teaching",
  "teacher_training",
  "paper_marking",
  "consultancy",
  "phone_ambassador",
  "administrative_services",
  "misc_expenses",
] as const;

export type TaskType =
  | (typeof TASKS)[number]
  | (typeof SUPPLIER_TASKS)[number];

export const TASK_LABELS: Record<TaskType, string> = {
  teaching: "Teaching",
  teacher_training: "Teacher Training",
  paper_marking: "Paper Marking",
  fixed_salary: "Fixed Salary",
  consultancy: "Consultancy",
  phone_ambassador: "Phone Ambassador",
  administrative_services: "Administrative Services",
  misc_expenses: "Misc. Expenses",
};

/** When this task is chosen, session/time/rate inputs are driven by the fixed salary. */
export const isFixedSalaryTask = (t: TaskType) => t === "fixed_salary";

// --- Member type (individual vs supplier) ---------------------------------

export const MEMBER_TYPES = ["individual", "supplier"] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  individual: "Individual",
  supplier: "Supplier",
};

// --- Rate units -----------------------------------------------------------

export const RATE_UNITS = ["per_session", "per_hour", "fixed"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  per_session: "per session",
  per_hour: "per hour",
  fixed: "fixed salary",
};

// --- Invoice status -------------------------------------------------------

export const INVOICE_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "locked",
  "paid",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Virtual status shown in HR dashboard when a team member has no invoice yet. */
export type DashboardStatus = InvoiceStatus | "not_started";

export const STATUS_META: Record<
  DashboardStatus,
  { label: string; badge: string; dot: string }
> = {
  not_started: {
    label: "Not started",
    badge: "bg-ink-100 text-ink-600 ring-ink-200",
    dot: "bg-ink-400",
  },
  draft: {
    label: "Draft",
    badge: "bg-gold-50 text-gold-700 ring-gold-200",
    dot: "bg-gold-400",
  },
  submitted: {
    label: "Submitted",
    badge: "bg-brand-50 text-brand-700 ring-brand-200",
    dot: "bg-brand-500",
  },
  approved: {
    label: "Approved",
    badge: "bg-teal-50 text-teal-700 ring-teal-200",
    dot: "bg-teal-500",
  },
  locked: {
    label: "Locked",
    badge: "bg-brand-100 text-brand-800 ring-brand-300",
    dot: "bg-brand-700",
  },
  paid: {
    label: "Paid",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
};

// --- Months ---------------------------------------------------------------

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const monthLabel = (month: number) => MONTH_NAMES[month - 1] ?? String(month);

/** Human label for a period, e.g. "July 2026". */
export const periodLabel = (year: number, month: number) =>
  `${monthLabel(month)} ${year}`;

/** The self-acknowledgment terms printed at the bottom of every invoice. */
export const TAX_DECLARATION = `Self Acknowledgment of Tax Declaration: I am solely responsible for declaring this income to the relevant tax authorities in my country of residence. It is my obligation to fulfill any income tax or other tax liabilities in accordance with the laws of my residing country. MathVision shall not be held liable for any outstanding tax obligations.`;
