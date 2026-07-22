-- =====================================================================
-- Migration 0003: Row-Level Security
-- Every table is protected. Role checks use the SECURITY DEFINER helpers
-- from 0002 (which bypass RLS, avoiding policy recursion). The service_role
-- used by the seed script and privileged server actions bypasses RLS.
-- =====================================================================

-- --- invoice access helpers -----------------------------------------

create or replace function public.can_read_invoice(inv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invoices i
    where i.id = inv
      and (public.is_hr() or i.team_member_id = public.my_team_member_id())
  );
$$;

create or replace function public.can_write_invoice(inv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invoices i
    where i.id = inv
      and (
        public.is_hr()
        or (
          i.team_member_id = public.my_team_member_id()
          and i.status in ('draft', 'submitted', 'approved')
        )
      )
  );
$$;

create or replace function public.can_read_check(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dept_head_checks k
    where k.id = c and (public.is_hr() or k.created_by = auth.uid())
  );
$$;

create or replace function public.can_write_check(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dept_head_checks k
    where k.id = c and k.created_by = auth.uid()
  );
$$;

-- --- column/transition guards ---------------------------------------

-- Team members may edit ONLY their invoice display name + ship-to address.
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
  then
    raise exception 'Team members can only edit their invoice display name and ship-to address';
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_self_update_guard on public.team_members;
create trigger team_members_self_update_guard
  before update on public.team_members
  for each row execute function public.enforce_team_member_self_update();

-- Team members may only move an invoice between draft/submitted and can never
-- touch a locked/paid invoice or its identity fields.
create or replace function public.enforce_invoice_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_hr() then
    return new; -- service role or HR: unrestricted (HR drives status)
  end if;

  if old.status in ('locked', 'paid') then
    raise exception 'This invoice is locked and can no longer be edited';
  end if;

  if new.status not in ('draft', 'submitted') then
    raise exception 'You are not allowed to set this invoice status';
  end if;

  if new.team_member_id is distinct from old.team_member_id
     or new.invoice_number is distinct from old.invoice_number
     or new.period_year   is distinct from old.period_year
     or new.period_month  is distinct from old.period_month
  then
    raise exception 'Invoice identity cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_update_guard on public.invoices;
create trigger invoices_update_guard
  before update on public.invoices
  for each row execute function public.enforce_invoice_update();

-- New invoices created by a team member must start as a draft (they cannot
-- self-insert an already-approved/locked/paid invoice by bypassing the UI).
create or replace function public.enforce_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_hr() then
    return new; -- service role or HR: unrestricted
  end if;
  if new.status <> 'draft' then
    raise exception 'New invoices must start as a draft';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_insert_guard on public.invoices;
create trigger invoices_insert_guard
  before insert on public.invoices
  for each row execute function public.enforce_invoice_insert();

-- =====================================================================
-- Enable RLS + policies
-- =====================================================================

-- --- profiles --------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_hr());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (public.is_hr()) with check (public.is_hr());

-- --- company_settings ------------------------------------------------
alter table public.company_settings enable row level security;

drop policy if exists company_select on public.company_settings;
create policy company_select on public.company_settings
  for select using (auth.uid() is not null);

drop policy if exists company_insert on public.company_settings;
create policy company_insert on public.company_settings
  for insert with check (public.is_hr());

drop policy if exists company_update on public.company_settings;
create policy company_update on public.company_settings
  for update using (public.is_hr()) with check (public.is_hr());

-- --- team_members ----------------------------------------------------
alter table public.team_members enable row level security;

drop policy if exists tm_select on public.team_members;
create policy tm_select on public.team_members
  for select using (
    public.is_hr()
    or public.is_dept_head()
    or profile_id = auth.uid()
  );

drop policy if exists tm_insert on public.team_members;
create policy tm_insert on public.team_members
  for insert with check (public.is_hr());

drop policy if exists tm_update on public.team_members;
create policy tm_update on public.team_members
  for update using (public.is_hr() or profile_id = auth.uid())
  with check (public.is_hr() or profile_id = auth.uid());

drop policy if exists tm_delete on public.team_members;
create policy tm_delete on public.team_members
  for delete using (public.is_hr());

-- --- team_member_rates ----------------------------------------------
alter table public.team_member_rates enable row level security;

drop policy if exists rates_select on public.team_member_rates;
create policy rates_select on public.team_member_rates
  for select using (
    public.is_hr() or team_member_id = public.my_team_member_id()
  );

drop policy if exists rates_write on public.team_member_rates;
create policy rates_write on public.team_member_rates
  for all using (public.is_hr()) with check (public.is_hr());

-- --- invoice_periods -------------------------------------------------
alter table public.invoice_periods enable row level security;

drop policy if exists periods_select on public.invoice_periods;
create policy periods_select on public.invoice_periods
  for select using (auth.uid() is not null);

drop policy if exists periods_write on public.invoice_periods;
create policy periods_write on public.invoice_periods
  for all using (public.is_hr()) with check (public.is_hr());

-- --- invoices --------------------------------------------------------
alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (
    public.is_hr() or team_member_id = public.my_team_member_id()
  );

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert with check (
    public.is_hr() or team_member_id = public.my_team_member_id()
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update using (
    public.is_hr() or team_member_id = public.my_team_member_id()
  ) with check (
    public.is_hr() or team_member_id = public.my_team_member_id()
  );

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete using (
    public.is_hr()
    or (team_member_id = public.my_team_member_id() and status = 'draft')
  );

-- --- invoice_line_items ---------------------------------------------
alter table public.invoice_line_items enable row level security;

drop policy if exists line_items_select on public.invoice_line_items;
create policy line_items_select on public.invoice_line_items
  for select using (public.can_read_invoice(invoice_id));

drop policy if exists line_items_insert on public.invoice_line_items;
create policy line_items_insert on public.invoice_line_items
  for insert with check (public.can_write_invoice(invoice_id));

drop policy if exists line_items_update on public.invoice_line_items;
create policy line_items_update on public.invoice_line_items
  for update using (public.can_write_invoice(invoice_id))
  with check (public.can_write_invoice(invoice_id));

drop policy if exists line_items_delete on public.invoice_line_items;
create policy line_items_delete on public.invoice_line_items
  for delete using (public.can_write_invoice(invoice_id));

-- --- dept_head_checks ------------------------------------------------
alter table public.dept_head_checks enable row level security;

drop policy if exists dh_checks_select on public.dept_head_checks;
create policy dh_checks_select on public.dept_head_checks
  for select using (public.is_hr() or created_by = auth.uid());

drop policy if exists dh_checks_insert on public.dept_head_checks;
create policy dh_checks_insert on public.dept_head_checks
  for insert with check (public.is_dept_head() and created_by = auth.uid());

drop policy if exists dh_checks_update on public.dept_head_checks;
create policy dh_checks_update on public.dept_head_checks
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists dh_checks_delete on public.dept_head_checks;
create policy dh_checks_delete on public.dept_head_checks
  for delete using (created_by = auth.uid());

-- --- dept_head_check_items ------------------------------------------
alter table public.dept_head_check_items enable row level security;

drop policy if exists dh_items_select on public.dept_head_check_items;
create policy dh_items_select on public.dept_head_check_items
  for select using (public.can_read_check(check_id));

drop policy if exists dh_items_write on public.dept_head_check_items;
create policy dh_items_write on public.dept_head_check_items
  for all using (public.can_write_check(check_id))
  with check (public.can_write_check(check_id));

-- --- messages --------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (auth.uid() is not null);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (public.is_hr());

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (public.is_hr()) with check (public.is_hr());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (public.is_hr());
