-- =====================================================================
-- Migration 0034: Timesheets (v1, standalone).
--
-- Team members log their work through the month as line items; each line is
-- verified by the assigned in-charge (department_head) or by HR. In-charges can
-- also add lines onto a member's timesheet, which the member then accepts.
--
-- Status lifecycle:
--   member adds        -> 'pending_review'      -> verify     -> 'verified' (locked)
--                                                -> return     -> 'returned' (member edits/resubmits)
--   in-charge adds     -> 'pending_acceptance'  -> accept      -> 'verified' (locked)
--                                                -> return     -> 'returned' (in-charge edits/resubmits)
-- HR (admin) can edit any entry at any status, locked ones included.
--
-- This is standalone for v1 — it does not touch invoices. All writes go through
-- the SECURITY DEFINER functions below (the table has SELECT-only RLS), which
-- enforce who may do what.
-- =====================================================================

do $$ begin
  create type public.timesheet_task as enum
    ('teaching', 'teacher_training', 'material_creation', 'other_support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.timesheet_status as enum
    ('pending_review', 'pending_acceptance', 'verified', 'returned');
exception when duplicate_object then null; end $$;

create table if not exists public.timesheet_entries (
  id                  uuid primary key default gen_random_uuid(),
  team_member_id      uuid not null references public.team_members (id) on delete cascade,
  entry_date          date not null,
  business            public.centre not null,
  task                public.timesheet_task not null,
  description         text,
  sessions            numeric(10, 2) not null default 0,
  hours               numeric(10, 2) not null default 0,
  incharge_id         uuid references public.profiles (id) on delete set null,
  status              public.timesheet_status not null default 'pending_review',
  created_by          uuid references public.profiles (id),
  created_by_incharge boolean not null default false,
  return_note         text,
  verified_by         uuid references public.profiles (id),
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists timesheet_entries_member_date_idx
  on public.timesheet_entries (team_member_id, entry_date);
create index if not exists timesheet_entries_incharge_status_idx
  on public.timesheet_entries (incharge_id, status);

drop trigger if exists timesheet_entries_set_updated_at on public.timesheet_entries;
create trigger timesheet_entries_set_updated_at
  before update on public.timesheet_entries
  for each row execute function public.set_updated_at();

-- --- RLS: a member sees their own lines, an in-charge the lines assigned to
-- them, and HR everything. All mutations go through the functions below.
alter table public.timesheet_entries enable row level security;

drop policy if exists timesheet_select on public.timesheet_entries;
create policy timesheet_select on public.timesheet_entries
  for select using (
    public.is_hr()
    or team_member_id = public.my_team_member_id()
    or incharge_id = auth.uid()
  );

-- --- Dropdown of in-charges available for the timesheet. Hard-limited to the
-- test login IDs while the feature is in testing (widen here later).
create or replace function public.timesheet_inchargers()
returns table (id uuid, full_name text, business public.centre)
language sql
stable
security definer
set search_path = public
as $$
  select id, full_name, business
  from public.profiles
  where role = 'department_head' and login_code in ('9999', '9876')
  order by full_name;
$$;

-- --- Member adds a line on their own timesheet -----------------------
create or replace function public.timesheet_add(
  p_date        date,
  p_business    public.centre,
  p_task        public.timesheet_task,
  p_description text,
  p_sessions    numeric,
  p_hours       numeric,
  p_incharge    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tm uuid;
  v_id uuid;
begin
  v_tm := public.my_team_member_id();
  if v_tm is null then
    raise exception 'Only team members can add timesheet entries';
  end if;
  if coalesce(p_sessions, 0) <= 0 and coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter a number of sessions or hours';
  end if;
  insert into public.timesheet_entries
    (team_member_id, entry_date, business, task, description, sessions, hours,
     incharge_id, status, created_by, created_by_incharge)
  values
    (v_tm, p_date, p_business, p_task, nullif(btrim(p_description), ''),
     coalesce(p_sessions, 0), coalesce(p_hours, 0),
     p_incharge, 'pending_review', auth.uid(), false)
  returning id into v_id;
  return v_id;
end;
$$;

-- --- In-charge (or HR) adds a line onto a member's timesheet ----------
create or replace function public.timesheet_add_for_member(
  p_member      uuid,
  p_date        date,
  p_business    public.centre,
  p_task        public.timesheet_task,
  p_description text,
  p_sessions    numeric,
  p_hours       numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_dept_head() or public.is_hr()) then
    raise exception 'Only in-charges or HR can add entries for a member';
  end if;
  if coalesce(p_sessions, 0) <= 0 and coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter a number of sessions or hours';
  end if;
  insert into public.timesheet_entries
    (team_member_id, entry_date, business, task, description, sessions, hours,
     incharge_id, status, created_by, created_by_incharge)
  values
    (p_member, p_date, p_business, p_task, nullif(btrim(p_description), ''),
     coalesce(p_sessions, 0), coalesce(p_hours, 0),
     auth.uid(), 'pending_acceptance', auth.uid(), true)
  returning id into v_id;
  return v_id;
end;
$$;

-- --- Edit a line (author while un-locked; HR anytime) ----------------
create or replace function public.timesheet_update(
  p_id          uuid,
  p_date        date,
  p_business    public.centre,
  p_task        public.timesheet_task,
  p_description text,
  p_sessions    numeric,
  p_hours       numeric,
  p_incharge    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.timesheet_entries;
  v_tm  uuid;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then raise exception 'Entry not found'; end if;
  if coalesce(p_sessions, 0) <= 0 and coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter a number of sessions or hours';
  end if;

  if public.is_hr() then
    -- HR can edit anything, including locked lines; status is left as-is.
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = coalesce(p_sessions, 0), hours = coalesce(p_hours, 0),
      incharge_id = coalesce(p_incharge, incharge_id)
    where id = p_id;
    return;
  end if;

  v_tm := public.my_team_member_id();

  if not v_row.created_by_incharge then
    -- The member's own line — editable while pending_review or returned.
    if v_row.team_member_id is distinct from v_tm then raise exception 'Not allowed'; end if;
    if v_row.status not in ('pending_review', 'returned') then
      raise exception 'This entry is locked and can no longer be edited';
    end if;
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = coalesce(p_sessions, 0), hours = coalesce(p_hours, 0),
      incharge_id = coalesce(p_incharge, incharge_id),
      status = 'pending_review', return_note = null
    where id = p_id;
  else
    -- An in-charge-added line — editable by its author while un-accepted.
    if v_row.incharge_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
    if v_row.status not in ('pending_acceptance', 'returned') then
      raise exception 'This entry is locked and can no longer be edited';
    end if;
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = coalesce(p_sessions, 0), hours = coalesce(p_hours, 0),
      status = 'pending_acceptance', return_note = null
    where id = p_id;
  end if;
end;
$$;

-- --- In-charge / HR verifies a member-submitted line -----------------
create or replace function public.timesheet_verify(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.timesheet_entries;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then raise exception 'Entry not found'; end if;
  if v_row.status <> 'pending_review' then raise exception 'This entry is not awaiting review'; end if;
  if not (public.is_hr() or v_row.incharge_id is not distinct from auth.uid()) then raise exception 'Not allowed'; end if;
  update public.timesheet_entries
    set status = 'verified', verified_by = auth.uid(), verified_at = now(), return_note = null
  where id = p_id;
end;
$$;

-- --- Member / HR accepts an in-charge-added line ---------------------
create or replace function public.timesheet_accept(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.timesheet_entries;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then raise exception 'Entry not found'; end if;
  if v_row.status <> 'pending_acceptance' then raise exception 'This entry is not awaiting acceptance'; end if;
  if not (public.is_hr() or v_row.team_member_id is not distinct from public.my_team_member_id()) then
    raise exception 'Not allowed';
  end if;
  update public.timesheet_entries
    set status = 'verified', verified_by = auth.uid(), verified_at = now(), return_note = null
  where id = p_id;
end;
$$;

-- --- Return a line with a note (either direction) --------------------
create or replace function public.timesheet_return(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.timesheet_entries;
  v_tm  uuid;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then raise exception 'Entry not found'; end if;
  v_tm := public.my_team_member_id();
  if v_row.status = 'pending_review' then
    if not (public.is_hr() or v_row.incharge_id is not distinct from auth.uid()) then raise exception 'Not allowed'; end if;
  elsif v_row.status = 'pending_acceptance' then
    if not (public.is_hr() or v_row.team_member_id is not distinct from v_tm) then raise exception 'Not allowed'; end if;
  else
    raise exception 'This entry cannot be returned';
  end if;
  update public.timesheet_entries
    set status = 'returned', return_note = nullif(btrim(p_note), '')
  where id = p_id;
end;
$$;

-- --- Delete a line ---------------------------------------------------
create or replace function public.timesheet_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.timesheet_entries;
  v_tm  uuid;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then return; end if;
  if public.is_hr() then
    delete from public.timesheet_entries where id = p_id;
    return;
  end if;
  v_tm := public.my_team_member_id();
  if not v_row.created_by_incharge then
    if v_row.team_member_id is not distinct from v_tm and v_row.status in ('pending_review', 'returned') then
      delete from public.timesheet_entries where id = p_id;
      return;
    end if;
  else
    if v_row.incharge_id is not distinct from auth.uid() and v_row.status in ('pending_acceptance', 'returned') then
      delete from public.timesheet_entries where id = p_id;
      return;
    end if;
  end if;
  raise exception 'Not allowed';
end;
$$;
