-- =====================================================================
-- Migration 0007: Invoice adjustments
-- Adds an "adjustment" line kind for supplier invoices: a deduction or
-- addition with a required description, optionally attributed to a specific
-- roster person (e.g. an unpaid day off), or general to the whole invoice.
--
-- Adjustments reuse the existing invoice_line_items machinery: they are
-- stored with rate_unit = 'fixed' and a signed rate_amount (negative for a
-- subtraction). The dedicated task value below both labels them on the
-- invoice ("Adjustment") and lets the editor tell an adjustment apart from a
-- fixed-salary person line on reload. No RPC change is needed —
-- save_supplier_invoice already stores fixed-amount lines and snapshots the
-- attributed person from supplier_member_id.
-- =====================================================================

alter type public.task_type add value if not exists 'adjustment';
