-- =====================================================================
-- Migration 0037: Recruitment settings (key/value) storage.
--
-- Completes the recruitment tool's move into Supabase: the few remaining
-- app settings (e.g. the daily-report WhatsApp recipient number) were kept
-- in the browser's localStorage, so they were per-device and not shared.
-- This gives the app a small HR-only key/value store instead.
--
--   * recruitment_settings (key text pk, value jsonb, updated_at)
--   * recruitment_set_setting(key, value) — upsert a single setting
-- =====================================================================

create table if not exists public.recruitment_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.recruitment_settings enable row level security;

-- HR can read; all writes go through the SECURITY DEFINER function below.
drop policy if exists recruitment_settings_select on public.recruitment_settings;
create policy recruitment_settings_select on public.recruitment_settings
  for select using (public.is_hr());

create or replace function public.recruitment_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_hr() then
    raise exception 'Not allowed';
  end if;
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'key required';
  end if;

  insert into public.recruitment_settings (key, value, updated_at)
  values (btrim(p_key), coalesce(p_value, 'null'::jsonb), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
end;
$$;
