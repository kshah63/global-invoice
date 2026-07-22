import type { InvoiceStatus, RateUnit } from "./constants";

/** Round to 2 decimal places, avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Invoice number: INV-[employee ID]-[yyyy]-[mm]
 * e.g. INV-1042-2026-07
 */
export function generateInvoiceNumber(
  employeeId: string,
  year: number,
  month: number
): string {
  return `INV-${employeeId}-${year}-${pad2(month)}`;
}

export interface LineTotalInput {
  rate_unit: RateUnit;
  rate_amount: number;
  sessions: number;
  hours: number;
}

/**
 * Line total is driven by the rate's unit:
 *  - per_session → sessions × rate
 *  - per_hour    → hours × rate
 *  - fixed       → the fixed amount itself (salary line)
 * This reconciles the spec's "Sessions × Rate" table with hourly rates and
 * the Fixed Salary task.
 */
export function computeLineTotal(item: LineTotalInput): number {
  const rate = Number(item.rate_amount) || 0;
  switch (item.rate_unit) {
    case "per_session":
      return round2((Number(item.sessions) || 0) * rate);
    case "per_hour":
      return round2((Number(item.hours) || 0) * rate);
    case "fixed":
      return round2(rate);
    default:
      return 0;
  }
}

export interface InvoiceTotals {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

/**
 * Totals for the whole invoice. A tax percentage is applied to the subtotal and
 * shown as its own line immediately before the total.
 */
export function computeInvoiceTotals(
  lineTotals: number[],
  taxRate: number
): InvoiceTotals {
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + (Number(t) || 0), 0));
  const safeRate = Number.isFinite(taxRate) ? Math.max(0, taxRate) : 0;
  const taxAmount = round2((subtotal * safeRate) / 100);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxRate: safeRate, taxAmount, total };
}

// --- Invoice state machine -----------------------------------------------

/** Statuses in which a team member may still edit line items / details. */
export const TEAM_MEMBER_EDITABLE: InvoiceStatus[] = [
  "draft",
  "submitted",
  "approved",
];

/** Fully locked — no edits by anyone (HR still controls status transitions). */
export function isContentLocked(status: InvoiceStatus): boolean {
  return status === "locked" || status === "paid";
}

export function canTeamMemberEdit(status: InvoiceStatus): boolean {
  return TEAM_MEMBER_EDITABLE.includes(status);
}

/**
 * When a team member edits an already-approved invoice, it drops back to
 * "submitted" so HR must re-approve. Draft/submitted stay as-is.
 */
export function statusAfterTeamMemberEdit(status: InvoiceStatus): InvoiceStatus {
  return status === "approved" ? "submitted" : status;
}

export type HrAction =
  | "approve"
  | "request_changes"
  | "lock"
  | "reopen"
  | "mark_paid"
  | "revert_paid";

export interface HrActionDef {
  action: HrAction;
  label: string;
  /** resulting status */
  to: InvoiceStatus;
  tone: "primary" | "gold" | "neutral" | "danger";
}

/** HR actions available from a given status. */
export function hrActionsFor(status: InvoiceStatus): HrActionDef[] {
  switch (status) {
    case "submitted":
      return [
        { action: "approve", label: "Approve", to: "approved", tone: "primary" },
        {
          action: "request_changes",
          label: "Request changes",
          to: "draft",
          tone: "neutral",
        },
      ];
    case "approved":
      return [
        { action: "lock", label: "Lock invoice", to: "locked", tone: "primary" },
        { action: "reopen", label: "Reopen", to: "submitted", tone: "neutral" },
      ];
    case "locked":
      return [
        { action: "mark_paid", label: "Mark as paid", to: "paid", tone: "primary" },
        { action: "reopen", label: "Unlock", to: "approved", tone: "neutral" },
      ];
    case "paid":
      return [
        { action: "revert_paid", label: "Revert to locked", to: "locked", tone: "neutral" },
      ];
    case "draft":
    default:
      return [];
  }
}

/** Validate an HR transition is legal for the current status. */
export function isValidHrTransition(
  status: InvoiceStatus,
  action: HrAction
): HrActionDef | null {
  return hrActionsFor(status).find((a) => a.action === action) ?? null;
}
