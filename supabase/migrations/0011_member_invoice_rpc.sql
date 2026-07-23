-- =====================================================================
-- Migration 0011: member-invoice RPCs + consolidation
--   save_member_invoice     — member saves their own draft (rates resolved
--                             server-side from their own supplier_member_rates)
--   return_member_invoice   — leader/HR send a submission back with a note
--   pull_member_invoices    — leader imports submitted member lines into the
--                             consolidated invoice (replacing prior imports)
--   save_supplier_invoice   — re-declared to carry source_member_invoice_id so
--                             imports survive a save and can be re-pulled
--   lock trigger            — member invoices lock when the consolidated is sent
-- Depends on 0010.
-- =====================================================================

-- --- member invoice status timestamps -------------------------------

create or replace function public.set_member_invoice_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.submitted_at := case
    when new.status in ('submitted', 'locked') then coalesce(new.submitted_at, now())
    else new.submitted_at end;
  new.returned_at := case
    when new.status = 'returned' then coalesce(new.returned_at, now())
    else new.returned_at end;
  return new;
end;
$$;

drop trigger if exists smi_timestamps on public.supplier_member_invoices;
create trigger smi_timestamps
  before insert or update on public.supplier_member_invoices
  for each row execute function public.set_member_invoice_timestamps();

-- --- member saves their own draft (atomic) --------------------------
-- Work-line rates are resolved from the member's OWN supplier_member_rates
-- (never trusted from the client). Adjustment lines use rate_unit 'fixed' with
-- a client-typed, possibly negative amount.

create or replace function public.save_member_invoice(
  p_invoice      uuid,
  p_display_name text,
  p_notes        text,
  p_items        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur_status public.member_invoice_status;
  v_member   uuid;
begin
  select status, supplier_member_id into cur_status, v_member
    from public.supplier_member_invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  update public.supplier_member_invoices set
    display_name = coalesce(p_display_name, display_name),
    notes        = p_notes
  where id = p_invoice;

  delete from public.supplier_member_invoice_items where member_invoice_id = p_invoice;

  insert into public.supplier_member_invoice_items
    (member_invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order)
  select
    p_invoice,
    coalesce(nullif(it ->> 'centre', ''), 'MathVision')::public.centre,
    coalesce(nullif(it ->> 'task', ''), 'teaching')::public.task_type,
    nullif(it ->> 'note', ''),
    coalesce((it ->> 'sessions')::numeric, 0),
    coalesce((it ->> 'hours')::numeric, 0),
    case when (it ->> 'task') = 'adjustment' then null::uuid else r.id end,
    case when (it ->> 'task') = 'adjustment'
           then coalesce(nullif(it ->> 'rate_descriptor', ''), 'Adjustment')
         else r.descriptor end,
    case when (it ->> 'task') = 'adjustment' then 'fixed'::public.rate_unit
         else coalesce(r.unit, 'per_session'::public.rate_unit) end,
    case when (it ->> 'task') = 'adjustment' then coalesce((it ->> 'rate_amount')::numeric, 0)
         else coalesce(r.amount, 0) end,
    coalesce((it ->> 'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.supplier_member_rates r
    on r.id = nullif(it ->> 'rate_id', '')::uuid
    and r.supplier_member_id = v_member;
end;
$$;

-- --- leader / HR send a submission back for correction --------------

create or replace function public.return_member_invoice(p_invoice uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  cur        public.member_invoice_status;
begin
  select supplier_id, status into v_supplier, cur
    from public.supplier_member_invoices where id = p_invoice;
  if v_supplier is null then
    raise exception 'Submission not found';
  end if;
  if not (public.is_hr() or v_supplier = public.my_team_member_id()) then
    raise exception 'Not allowed';
  end if;
  if cur = 'locked' then
    raise exception 'This submission is already locked';
  end if;

  update public.supplier_member_invoices
     set status = 'returned', return_note = nullif(p_note, ''), returned_at = now()
   where id = p_invoice;
end;
$$;

-- --- leader pulls submitted member lines into the consolidated ------
-- Replaces previously-imported lines (source_member_invoice_id set) while
-- keeping the leader's own lines. Returns the number of members pulled in.

create or replace function public.pull_member_invoices(p_invoice uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_year     int;
  v_month    int;
  v_status   public.invoice_status;
  n          int;
begin
  select team_member_id, period_year, period_month, status
    into v_supplier, v_year, v_month, v_status
    from public.invoices where id = p_invoice;
  if v_supplier is null then
    raise exception 'Invoice not found';
  end if;
  if not (public.is_hr() or v_supplier = public.my_team_member_id()) then
    raise exception 'Not allowed';
  end if;
  if v_status in ('locked', 'paid') then
    raise exception 'This invoice is locked';
  end if;

  delete from public.invoice_line_items
    where invoice_id = p_invoice and source_member_invoice_id is not null;

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order,
     supplier_member_id, worked_by_name, source_member_invoice_id)
  select
    p_invoice,
    it.centre, it.task, it.note, it.sessions, it.hours,
    null::uuid,  -- rate_id column is FK'd to team_member_rates; snapshot instead
    it.rate_descriptor, it.rate_unit, it.rate_amount,
    (1000 + row_number() over (order by sm.name, mi.id, it.sort_order))::int,
    sm.id, sm.name, mi.id
  from public.supplier_member_invoices mi
  join public.supplier_members sm on sm.id = mi.supplier_member_id
  join public.supplier_member_invoice_items it on it.member_invoice_id = mi.id
  where mi.supplier_id = v_supplier
    and mi.period_year = v_year
    and mi.period_month = v_month
    and mi.status = 'submitted';

  select count(distinct mi.id) into n
    from public.supplier_member_invoices mi
   where mi.supplier_id = v_supplier
     and mi.period_year = v_year
     and mi.period_month = v_month
     and mi.status = 'submitted';
  return coalesce(n, 0);
end;
$$;

-- --- consolidated save now carries the import link -----------------
-- (re-declares save_supplier_invoice from 0006 with source_member_invoice_id)

create or replace function public.save_supplier_invoice(
  p_invoice      uuid,
  p_display_name text,
  p_ship_to      text,
  p_notes        text,
  p_tax_rate     numeric,
  p_items        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur_status  public.invoice_status;
  v_supplier  uuid;
begin
  select status, team_member_id into cur_status, v_supplier
    from public.invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  update public.invoices set
    display_name    = coalesce(p_display_name, display_name),
    ship_to_address = p_ship_to,
    notes           = p_notes,
    tax_rate        = round(coalesce(p_tax_rate, 0), 3),
    status          = case when status = 'approved' then 'submitted'::public.invoice_status
                           else status end
  where id = p_invoice;

  delete from public.invoice_line_items where invoice_id = p_invoice;

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order,
     supplier_member_id, worked_by_name, source_member_invoice_id)
  select
    p_invoice,
    coalesce(nullif(it ->> 'centre', ''), 'MathVision')::public.centre,
    coalesce(nullif(it ->> 'task', ''), 'teaching')::public.task_type,
    nullif(it ->> 'note', ''),
    coalesce((it ->> 'sessions')::numeric, 0),
    coalesce((it ->> 'hours')::numeric, 0),
    null::uuid,
    case when (it ->> 'rate_unit') = 'fixed'
         then coalesce(nullif(it ->> 'rate_descriptor', ''), 'Adjustment')
         else r.descriptor end,
    case when (it ->> 'rate_unit') = 'fixed' then 'fixed'::public.rate_unit
         else coalesce(r.unit, 'per_session'::public.rate_unit) end,
    case when (it ->> 'rate_unit') = 'fixed' then coalesce((it ->> 'rate_amount')::numeric, 0)
         else coalesce(r.amount, 0) end,
    coalesce((it ->> 'sort_order')::int, (ord - 1)::int),
    sm.id,
    sm.name,
    nullif(it ->> 'source_member_invoice_id', '')::uuid
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.supplier_members sm
    on sm.id = nullif(it ->> 'supplier_member_id', '')::uuid
    and sm.supplier_id = v_supplier
  left join public.supplier_member_rates r
    on r.id = nullif(it ->> 'rate_id', '')::uuid
    and r.supplier_member_id = sm.id;
end;
$$;

-- --- lock member invoices when the consolidated is submitted --------

create or replace function public.lock_member_invoices_on_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('submitted', 'approved', 'locked', 'paid')
     and new.status is distinct from old.status
     and exists (
       select 1 from public.team_members t
       where t.id = new.team_member_id and t.member_type = 'supplier'
     )
  then
    update public.supplier_member_invoices
       set status = 'locked'
     where supplier_id = new.team_member_id
       and period_year = new.period_year
       and period_month = new.period_month
       and status <> 'locked';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_lock_member_invoices on public.invoices;
create trigger invoices_lock_member_invoices
  after update on public.invoices
  for each row execute function public.lock_member_invoices_on_submit();
