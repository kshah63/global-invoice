-- =====================================================================
-- Migration 0032: add the 'reversed' invoice status.
--
-- A paid invoice whose bank transfer was reversed (bounced) moves to
-- 'reversed'. It is terminal for that month — no longer counted as paid,
-- not re-payable, and not editable by the team member — with the owed
-- amount carried into next month's invoice (see 0033).
--
-- ADD VALUE must be committed before the value can be used at runtime, so
-- it lives in its own migration ahead of 0033, which references it.
-- =====================================================================

alter type public.invoice_status add value if not exists 'reversed';
