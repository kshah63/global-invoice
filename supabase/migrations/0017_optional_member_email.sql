-- =====================================================================
-- Migration 0017: individual team members can be created without an email
-- They sign in by their 4-digit employee ID; an email is optional (a person
-- can have one added later if they want invoices emailed to them). Relax the
-- not-null so we can store "no email" rather than a placeholder.
-- =====================================================================

alter table public.team_members alter column email drop not null;
