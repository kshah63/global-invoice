-- =====================================================================
-- Migration 0006: Suppliers
-- Adds a "supplier" party type: a business whose leader logs in and submits
-- one monthly invoice covering several people (a roster). Individuals are
-- unchanged. Also adds supplier-oriented task types.
-- =====================================================================

-- --- Enums ----------------------------------------------------------

do $$ begin
  create type public.member_type as enum ('individual', 'supplier');
exception when duplicate_object then null; end $$;

-- New task types (available on supplier invoices). Adding enum values is
-- idempotent; they are not used elsewhere in this migration.
alter type public.task_type add value if not exists 'consultancy';
alter type public.task_type add value if not exists 'phone_ambassador';
alter type public.task_type add value if not exists 'administrative_services';
alter type public.task_type add value if not exists 'misc_expenses';

-- --- team_members: individual vs supplier ---------------------------

alter table public.team_members
  add column if not exists member_type public.member_type not null default 'individual';
alter table public.team_members
  add column if not exists supplier_code text;

-- Suppliers have no employee ID (they use a supplier_code), so relax the
-- not-null and format constraints to allow null employee IDs.
alter table public.team_members alter column employee_id drop not null;

alter table public.team_members drop constraint if exists team_members_employee_id_format;
alter table public.team_members
  add constraint team_members_employee_id_format
  check (employee_id is null or employee_id ~ '^[0-9]{4}$');

do $$ begin
  alter table public.team_members
    add constraint team_members_supplier_code_key unique (supplier_code);
exception when duplicate_object then null; end $$;

-- --- Supplier roster (people; they do NOT log in) -------------------

create table if not exists public.supplier_members (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.team_members (id) on delete cascade,
  name        text not null,
  code        text not null,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint supplier_members_code_format check (code ~ '^[0-9]{4}$'),
  unique (supplier_id, code)
);
create index if not exists supplier_members_supplier_idx
  on public.supplier_members (supplier_id);

create table if not exists public.supplier_member_rates (
  id                 uuid primary key default gen_random_uuid(),
  supplier_member_id uuid not null references public.supplier_members (id) on delete cascade,
  descriptor         text not null,
  unit               public.rate_unit not null default 'per_session',
  amount             numeric(14,2) not null default 0,
  task               public.task_type,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists supplier_member_rates_member_idx
  on public.supplier_member_rates (supplier_member_id);

-- --- invoice_line_items: which supplier person a line is for --------

alter table public.invoice_line_items
  add column if not exists supplier_member_id uuid
  references public.supplier_members (id) on delete set null;
alter table public.invoice_line_items
  add column if not exists worked_by_name text;

-- --- Protect supplier fields from team-member self-updates ----------

create or replace function public.enforce_team_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_hr() then
    return new; -- service role or HR: unrestricted
  end if;

  if new.profile_id       is distinct from old.profile_id
     or new.name          is distinct from old.name
     or new.whatsapp_number is distinct from old.whatsapp_number
     or new.email         is distinct from old.email
     or new.employee_id   is distinct from old.employee_id
     or new.date_joined   is distinct from old.date_joined
     or new.nationality   is distinct from old.nationality
     or new.work_location is distinct from old.work_location
     or new.head_of_department is distinct from old.head_of_department
     or new.payment_details is distinct from old.payment_details
     or new.currency      is distinct from old.currency
     or new.fixed_salary  is distinct from old.fixed_salary
     or new.subjects      is distinct from old.subjects
     or new.active        is distinct from old.active
     or new.member_type   is distinct from old.member_type
     or new.supplier_code is distinct from old.supplier_code
  then
    raise exception 'Team members can only edit their invoice display name and ship-to address';
  end if;

  return new;
end;
$$;

-- --- RLS for supplier tables ----------------------------------------

alter table public.supplier_members enable row level security;

drop policy if exists sm_select on public.supplier_members;
create policy sm_select on public.supplier_members
  for select using (
    public.is_hr() or supplier_id = public.my_team_member_id()
  );

drop policy if exists sm_write on public.supplier_members;
create policy sm_write on public.supplier_members
  for all using (public.is_hr()) with check (public.is_hr());

alter table public.supplier_member_rates enable row level security;

drop policy if exists smr_select on public.supplier_member_rates;
create policy smr_select on public.supplier_member_rates
  for select using (
    public.is_hr()
    or exists (
      select 1 from public.supplier_members sm
      where sm.id = supplier_member_id
        and sm.supplier_id = public.my_team_member_id()
    )
  );

drop policy if exists smr_write on public.supplier_member_rates;
create policy smr_write on public.supplier_member_rates
  for all using (public.is_hr()) with check (public.is_hr());

-- --- Atomic supplier invoice save -----------------------------------
-- Person-line rates are resolved server-side from supplier_member_rates
-- (never trusted from the client). Adjustment/misc lines use rate_unit 'fixed'
-- with a client-typed amount (may be negative). Each line snapshots the
-- person's name so historic invoices survive roster edits.

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
     supplier_member_id, worked_by_name)
  select
    p_invoice,
    coalesce(nullif(it ->> 'centre', ''), 'MathVision')::public.centre,
    coalesce(nullif(it ->> 'task', ''), 'teaching')::public.task_type,
    nullif(it ->> 'note', ''),
    coalesce((it ->> 'sessions')::numeric, 0),
    coalesce((it ->> 'hours')::numeric, 0),
    -- rate_id column is FK'd to team_member_rates (individuals only); supplier
    -- lines snapshot the rate instead of linking, so store null here.
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
    sm.name
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.supplier_members sm
    on sm.id = nullif(it ->> 'supplier_member_id', '')::uuid
    and sm.supplier_id = v_supplier
  left join public.supplier_member_rates r
    on r.id = nullif(it ->> 'rate_id', '')::uuid
    and r.supplier_member_id = sm.id;
end;
$$;

-- Department-head cross-checks are for individuals only — exclude suppliers
-- from the roster directory they pick from.
create or replace function public.list_team_members_for_dept()
returns table (id uuid, name text, employee_id text)
language sql
stable
security definer
set search_path = public
as $$
  select tm.id, tm.name, tm.employee_id
  from public.team_members tm
  where tm.active = true
    and tm.member_type = 'individual'
    and (public.is_dept_head() or public.is_hr())
  order by tm.name;
$$;
