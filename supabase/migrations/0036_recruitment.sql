-- =====================================================================
-- Migration 0036: Recruitment candidates (TalentFlow) storage.
--
-- The recruitment tool (embedded in /recruitment) keeps its full candidate
-- records as a JSONB blob per row — the app owns the shape, so we store it
-- verbatim and avoid modelling ~30 evolving fields here. HR-only.
--
--   * recruitment_candidates (id text pk, data jsonb, updated_at)
--   * recruitment_save_all(jsonb) — replace-all save used by the app's
--     persist step (upsert everything in the payload, delete anything not in it)
-- =====================================================================

create table if not exists public.recruitment_candidates (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.recruitment_candidates enable row level security;

-- HR can read; all writes go through the SECURITY DEFINER function below.
drop policy if exists recruitment_candidates_select on public.recruitment_candidates;
create policy recruitment_candidates_select on public.recruitment_candidates
  for select using (public.is_hr());

create or replace function public.recruitment_save_all(p_candidates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_hr() then
    raise exception 'Not allowed';
  end if;

  -- Remove any candidate the app no longer has (empty payload clears all).
  delete from public.recruitment_candidates
   where id not in (
     select e ->> 'id'
       from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) e
      where (e ? 'id') and nullif(e ->> 'id', '') is not null
   );

  -- Upsert everything in the payload.
  insert into public.recruitment_candidates (id, data, updated_at)
  select e ->> 'id', e, now()
    from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) e
   where (e ? 'id') and nullif(e ->> 'id', '') is not null
  on conflict (id) do update
    set data = excluded.data, updated_at = now();
end;
$$;
