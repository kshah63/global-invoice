-- =====================================================================
-- Migration 0005: department-head login ID
-- Gives department heads a 4-digit login code (so they can sign in with an ID
-- instead of an email, like team members). Stored on the profile.
-- =====================================================================

alter table public.profiles add column if not exists login_code text;

do $$ begin
  alter table public.profiles add constraint profiles_login_code_key unique (login_code);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_login_code_fmt
    check (login_code is null or login_code ~ '^[0-9]{4}$');
exception when duplicate_object then null; end $$;
