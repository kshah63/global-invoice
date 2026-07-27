-- =====================================================================
-- Migration 0024: ensure the 'adjustment' task_type value exists
--
-- 'adjustment' was added to the task_type enum in migration 0007. If 0007 was
-- skipped, save_member_invoice / save_invoice / save_supplier_invoice fail with
--   invalid input value for enum task_type: "adjustment"
-- even when there are NO adjustment lines, because the RPC references the value.
-- This repair is idempotent (safe to run even if the value already exists).
-- =====================================================================

alter type public.task_type add value if not exists 'adjustment';
