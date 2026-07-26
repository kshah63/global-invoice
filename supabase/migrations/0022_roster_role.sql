-- =====================================================================
-- Migration 0022: roster member job role
-- A roster member's role (teacher / phone ambassador / manager). Free-text
-- column constrained by the app's dropdown; nullable so existing rows are fine.
-- =====================================================================

alter table public.supplier_members
  add column if not exists role text;
