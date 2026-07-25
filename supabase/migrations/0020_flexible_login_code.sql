-- =====================================================================
-- Migration 0020: flexible department-head login codes
--
-- Department-head login IDs were pinned to exactly 4 digits (migration 0005).
-- Relax that to 4–6 alphanumeric characters — same shape as a supplier code —
-- while keeping existing 4-digit codes valid (they still match the new rule).
-- Uniqueness (profiles_login_code_key) is unchanged. Codes are stored
-- upper-cased by the app so matching is case-insensitive.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_login_code_fmt;

do $$ begin
  alter table public.profiles add constraint profiles_login_code_fmt
    check (login_code is null or login_code ~ '^[A-Za-z0-9]{4,6}$');
exception when duplicate_object then null; end $$;
