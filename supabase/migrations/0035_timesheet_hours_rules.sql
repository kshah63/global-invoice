-- =====================================================================
-- Migration 0035: task-aware sessions/hours rules for timesheets.
--
-- Hours drive pay, so every entry must have hours > 0. Teaching also requires
-- sessions > 0; all other tasks don't track sessions, so sessions is forced to
-- 0 regardless of what's submitted. Re-declares the three mutation functions
-- from 0034 with these rules.
-- =====================================================================

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
  v_tm       uuid;
  v_id       uuid;
  v_sessions numeric;
begin
  v_tm := public.my_team_member_id();
  if v_tm is null then
    raise exception 'Only team members can add timesheet entries';
  end if;
  if coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter the number of hours';
  end if;
  if p_task = 'teaching' and coalesce(p_sessions, 0) <= 0 then
    raise exception 'Teaching needs a number of sessions';
  end if;
  v_sessions := case when p_task = 'teaching' then coalesce(p_sessions, 0) else 0 end;

  insert into public.timesheet_entries
    (team_member_id, entry_date, business, task, description, sessions, hours,
     incharge_id, status, created_by, created_by_incharge)
  values
    (v_tm, p_date, p_business, p_task, nullif(btrim(p_description), ''),
     v_sessions, coalesce(p_hours, 0),
     p_incharge, 'pending_review', auth.uid(), false)
  returning id into v_id;
  return v_id;
end;
$$;

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
  v_id       uuid;
  v_sessions numeric;
begin
  if not (public.is_dept_head() or public.is_hr()) then
    raise exception 'Only in-charges or HR can add entries for a member';
  end if;
  if coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter the number of hours';
  end if;
  if p_task = 'teaching' and coalesce(p_sessions, 0) <= 0 then
    raise exception 'Teaching needs a number of sessions';
  end if;
  v_sessions := case when p_task = 'teaching' then coalesce(p_sessions, 0) else 0 end;

  insert into public.timesheet_entries
    (team_member_id, entry_date, business, task, description, sessions, hours,
     incharge_id, status, created_by, created_by_incharge)
  values
    (p_member, p_date, p_business, p_task, nullif(btrim(p_description), ''),
     v_sessions, coalesce(p_hours, 0),
     auth.uid(), 'pending_acceptance', auth.uid(), true)
  returning id into v_id;
  return v_id;
end;
$$;

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
  v_row      public.timesheet_entries;
  v_tm       uuid;
  v_sessions numeric;
begin
  select * into v_row from public.timesheet_entries where id = p_id;
  if v_row.id is null then raise exception 'Entry not found'; end if;
  if coalesce(p_hours, 0) <= 0 then
    raise exception 'Enter the number of hours';
  end if;
  if p_task = 'teaching' and coalesce(p_sessions, 0) <= 0 then
    raise exception 'Teaching needs a number of sessions';
  end if;
  v_sessions := case when p_task = 'teaching' then coalesce(p_sessions, 0) else 0 end;

  if public.is_hr() then
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = v_sessions, hours = coalesce(p_hours, 0),
      incharge_id = coalesce(p_incharge, incharge_id)
    where id = p_id;
    return;
  end if;

  v_tm := public.my_team_member_id();

  if not v_row.created_by_incharge then
    if v_row.team_member_id is distinct from v_tm then raise exception 'Not allowed'; end if;
    if v_row.status not in ('pending_review', 'returned') then
      raise exception 'This entry is locked and can no longer be edited';
    end if;
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = v_sessions, hours = coalesce(p_hours, 0),
      incharge_id = coalesce(p_incharge, incharge_id),
      status = 'pending_review', return_note = null
    where id = p_id;
  else
    if v_row.incharge_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
    if v_row.status not in ('pending_acceptance', 'returned') then
      raise exception 'This entry is locked and can no longer be edited';
    end if;
    update public.timesheet_entries set
      entry_date = p_date, business = p_business, task = p_task,
      description = nullif(btrim(p_description), ''),
      sessions = v_sessions, hours = coalesce(p_hours, 0),
      status = 'pending_acceptance', return_note = null
    where id = p_id;
  end if;
end;
$$;
