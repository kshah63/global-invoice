import type {
  Centre,
  Currency,
  InvoiceStatus,
  MemberInvoiceStatus,
  MemberType,
  PayType,
  RateUnit,
  Role,
  TaskType,
} from "./constants";

/**
 * Row shapes mirroring the Supabase schema (see supabase/migrations).
 * Numeric DB columns are surfaced as `number` (the API returns them as JS numbers
 * for `numeric` when small; we also coerce defensively where read).
 */

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  email: string;
  business: Centre | null;
  login_code: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  profile_id: string | null;
  member_type: MemberType;
  supplier_code: string | null; // suppliers only (used in invoice number)
  name: string;
  invoice_display_name: string | null;
  use_hr_name: boolean;
  whatsapp_number: string | null;
  email: string | null;
  employee_id: string | null; // 4-digit code (individuals); null for suppliers
  date_joined: string | null;
  nationality: string | null;
  work_location: string | null;
  head_of_department: string | null;
  payment_details: string | null;
  currency: Currency; // rate/invoice currency
  payment_currency: Currency | null; // payout currency (null = same as currency)
  ship_to_address: string | null;
  fixed_salary: number | null;
  subjects: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRate {
  id: string;
  team_member_id: string;
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
  sort_order: number;
  created_at: string;
}

export interface InvoicePeriod {
  id: string;
  year: number;
  month: number;
  is_open: boolean;
  opened_at: string | null;
  opened_by: string | null;
  note: string | null;
  created_at: string;
}

export interface CompanySnapshot {
  company_name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  registration_no: string | null;
}

export interface Invoice {
  id: string;
  team_member_id: string;
  period_year: number;
  period_month: number;
  invoice_number: string;
  status: InvoiceStatus;
  display_name: string;
  ship_to_address: string | null;
  currency: Currency;
  company_snapshot: CompanySnapshot | null;
  notes: string | null;
  subtotal: number;
  tax_rate: number; // percentage, e.g. 9 for 9%
  tax_amount: number;
  total: number;
  payment_currency: Currency | null; // payout currency (null = same as currency)
  fx_rate: number | null;
  fx_rate_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  centre: Centre;
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  rate_id: string | null;
  rate_descriptor: string | null;
  rate_unit: RateUnit;
  rate_amount: number;
  line_total: number;
  sort_order: number;
  supplier_member_id: string | null;
  worked_by_name: string | null;
  source_member_invoice_id: string | null; // set when imported from a member invoice
}

// --- Suppliers ------------------------------------------------------------

export interface SupplierMember {
  id: string;
  supplier_id: string;
  name: string;
  code: string; // 4-digit
  active: boolean;
  sort_order: number;
  profile_id: string | null; // login account, if HR created one
  email: string | null;
  payment_details: string | null;
  // Pay config: either a fixed monthly salary or a single session/hour rate.
  pay_type: PayType;
  monthly_salary: number | null;
  rate_unit: RateUnit;
  rate_amount: number;
  rate_descriptor: string | null;
  rate_task: TaskType | null;
  payment_currency: Currency | null; // null = same as the supplier's currency
  created_at: string;
}

export interface SupplierMemberRate {
  id: string;
  supplier_member_id: string;
  descriptor: string;
  unit: RateUnit;
  amount: number;
  task: TaskType | null;
  sort_order: number;
  created_at: string;
}

export interface SupplierMemberWithRates extends SupplierMember {
  rates: SupplierMemberRate[];
}

// A roster member's own monthly invoice to their supplier (Tier 1).
export interface SupplierMemberInvoice {
  id: string;
  supplier_member_id: string;
  supplier_id: string;
  period_year: number;
  period_month: number;
  status: MemberInvoiceStatus;
  display_name: string;
  notes: string | null;
  return_note: string | null;
  currency: Currency; // rate currency (= the supplier's currency)
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  quantity: number; // sessions/hours (rate members)
  payment_currency: Currency | null; // payout currency snapshot
  fx_rate: number | null; // actual rate HR recorded (rate ccy -> payment ccy)
  fx_rate_date: string | null;
  submitted_at: string | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierMemberInvoiceItem {
  id: string;
  member_invoice_id: string;
  centre: Centre;
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  rate_id: string | null;
  rate_descriptor: string | null;
  rate_unit: RateUnit;
  rate_amount: number;
  line_total: number;
  sort_order: number;
}

export interface DeptHeadCheck {
  id: string;
  created_by: string;
  team_member_id: string;
  period_year: number;
  period_month: number;
  business: Centre;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeptHeadCheckItem {
  id: string;
  check_id: string;
  task: TaskType;
  note: string | null;
  sessions: number;
  hours: number;
  sort_order: number;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  registration_no: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Message {
  id: string;
  sender_profile_id: string | null;
  sender_name: string | null;
  period_year: number | null;
  period_month: number | null;
  subject: string;
  body: string;
  created_at: string;
}

// --- Direct messages (1:1 HR <-> person) ----------------------------------

export interface Conversation {
  id: string;
  participant_id: string;
  last_message_at: string;
  last_message_from_hr: boolean;
  last_message_preview: string | null;
  hr_last_read_at: string | null;
  participant_last_read_at: string | null;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  from_hr: boolean;
  body: string;
  created_at: string;
}

// --- Composite view models ------------------------------------------------

export interface TeamMemberWithRates extends TeamMember {
  rates: TeamMemberRate[];
}

export interface InvoiceWithItems extends Invoice {
  line_items: InvoiceLineItem[];
}

export interface DeptHeadCheckWithItems extends DeptHeadCheck {
  items: DeptHeadCheckItem[];
}
