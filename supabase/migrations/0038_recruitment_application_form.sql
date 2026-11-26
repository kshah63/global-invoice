-- =====================================================================
-- Migration 0038: Recruitment application form + public submissions.
--
-- Replaces the old Google Form -> Google Sheet -> upload intake with a
-- native, shareable application form:
--
--   * recruitment_form        — the single editable questionnaire (one row,
--                               id 'default'): title, intro, thank-you text,
--                               enabled flag, source label, a random public
--                               slug, and the question schema (JSONB).
--   * recruitment_submissions — applicants' submissions as they arrive
--                               (candidate-shaped data + raw answers). A
--                               separate table so the HR app's replace-all
--                               candidate save can never clobber a brand-new
--                               submission that arrived mid-session.
--
-- Submissions land "straight onto the board": recruitment_absorb_submissions()
-- (called by the HR candidates GET) copies un-absorbed submissions into
-- recruitment_candidates as Stage-1 cards, idempotently and one-way (so a
-- later delete can't resurrect them).
--
-- The question schema itself is kept app-side (src/lib/recruitmentForm.ts) and
-- seeded here as '[]' (meaning "use the app default") so this migration stays
-- small; once HR edits & saves, the edited schema is stored in the row.
-- =====================================================================

create table if not exists public.recruitment_form (
  id            text primary key default 'default',
  slug          text unique not null default replace(gen_random_uuid()::text, '-', ''),
  title         text not null default 'MathVision Application Form',
  intro         text not null default '',
  thank_you     text not null default 'Thank you! Your application has been received.',
  enabled       boolean not null default true,
  source_label  text not null default 'Application Form',
  schema        jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists public.recruitment_submissions (
  id          text primary key,
  data        jsonb not null,
  answers     jsonb,
  source      text,
  promoted    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.recruitment_form enable row level security;
alter table public.recruitment_submissions enable row level security;

-- HR can read both (editor + audit). All writes go through SECURITY DEFINER
-- functions below, and the public applicant paths use the service-role client
-- (which bypasses RLS) in tightly-scoped API routes.
drop policy if exists recruitment_form_select on public.recruitment_form;
create policy recruitment_form_select on public.recruitment_form
  for select using (public.is_hr());

drop policy if exists recruitment_submissions_select on public.recruitment_submissions;
create policy recruitment_submissions_select on public.recruitment_submissions
  for select using (public.is_hr());

-- Seed the single form row (no-op if it already exists).
insert into public.recruitment_form (id, title, intro, thank_you, enabled, source_label, schema)
values (
  'default',
  'MathVision Application Form',
  'Hi! Thank you for reaching out to us. Please take a few minutes to fill in your details below. If you have any questions or need help, feel free to reach out to us anytime.',
  'Thank you! Your application has been received — our team will be in touch with you soon.',
  true,
  'Supreme HR',
  '[]'::jsonb
)
on conflict (id) do nothing;

-- Save the form (HR only). Upserts the single 'default' row, preserving slug.
create or replace function public.recruitment_save_form(
  p_title text,
  p_intro text,
  p_thank_you text,
  p_enabled boolean,
  p_source_label text,
  p_schema jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_hr() then
    raise exception 'Not allowed';
  end if;

  update public.recruitment_form
     set title        = coalesce(p_title, title),
         intro        = coalesce(p_intro, ''),
         thank_you    = coalesce(p_thank_you, thank_you),
         enabled      = coalesce(p_enabled, true),
         source_label = coalesce(nullif(btrim(p_source_label), ''), 'Application Form'),
         schema       = coalesce(p_schema, '[]'::jsonb),
         updated_at   = now()
   where id = 'default';

  if not found then
    insert into public.recruitment_form (id, title, intro, thank_you, enabled, source_label, schema)
    values ('default', coalesce(p_title, 'MathVision Application Form'), coalesce(p_intro, ''),
            coalesce(p_thank_you, 'Thank you! Your application has been received.'),
            coalesce(p_enabled, true),
            coalesce(nullif(btrim(p_source_label), ''), 'Application Form'),
            coalesce(p_schema, '[]'::jsonb));
  end if;
end;
$$;

-- Regenerate the public share link (HR only). Returns the new slug.
create or replace function public.recruitment_rotate_slug()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  if not public.is_hr() then
    raise exception 'Not allowed';
  end if;
  v_slug := replace(gen_random_uuid()::text, '-', '');
  update public.recruitment_form set slug = v_slug, updated_at = now() where id = 'default';
  return v_slug;
end;
$$;

-- Move un-absorbed submissions onto the pipeline board as Stage-1 candidates.
-- Idempotent and one-way: once a submission is absorbed it is marked promoted,
-- so deleting the candidate later does not bring it back.
create or replace function public.recruitment_absorb_submissions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_hr() then
    raise exception 'Not allowed';
  end if;

  select count(*) into v_count
    from public.recruitment_submissions s
   where s.promoted = false;

  insert into public.recruitment_candidates (id, data, updated_at)
  select s.id, s.data, now()
    from public.recruitment_submissions s
   where s.promoted = false
     and not exists (
       select 1 from public.recruitment_candidates c where c.id = s.id
     )
  on conflict (id) do nothing;

  update public.recruitment_submissions
     set promoted = true
   where promoted = false;

  return v_count;
end;
$$;
