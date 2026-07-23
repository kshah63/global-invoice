-- =====================================================================
-- Migration 0010: roster-member logins + member invoices (Tier 1)
-- A supplier's roster member logs in, fills their own monthly invoice
-- (billed to the supplier, e.g. EduTech) and submits it to the leader.
-- The leader pulls submitted member lines into the consolidated invoice to
-- MathVision (Tier 2, existing invoices table). HR never sees Tier-1
-- invoices in its dashboards — they live in their own tables.
-- Depends on 0009 (the 'supplier_member' role value must already exist).
-- =====================================================================

-- --- supplier_members gains a login + contact -----------------------

alter table public.supplier_members
  add column if not exists profile_id uuid unique references public.profiles (id) on delete set null;
alter table public.supplier_members
  add column if not exists email text;
alter table public.supplier_members
  add column if not exists payment_details text;

-- --- member invoice status ------------------------------------------

do $$ begin
  create type public.member_invoice_status as enum ('draft', 'submitted', 'returned', 'locked');
exception when duplicate_object then null; end $$;

-- --- supplier_member_invoices (one per member per month) ------------

create table if not exists public.supplier_member_invoices (
  id                 uuid primary key default gen_random_uuid(),
  supplier_member_id uuid not null references public.supplier_members (id) on delete cascade,
  supplier_id        uuid not null references public.team_members (id) on delete cascade,
  period_year        int not null,
  period_month       int not null check (period_month between 1 and 12),
  status             public.member_invoice_status not null default 'draft',
  display_name       text not null default '',
  notes              text,
  return_note        text,
  currency           public.currency_code not null default 'SGD',
  subtotal           numeric(14,2) not null default 0,
  tax_rate           numeric(6,3)  not null default 0,
  tax_amount         numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  submitted_at       timestamptz,
  returned_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (supplier_member_id, period_year, period_month)
);

create index if not exists smi_supplier_period_idx
  on public.supplier_member_invoices (supplier_id, period_year, period_month);
create index if not exists smi_member_idx
  on public.supplier_member_invoices (supplier_member_id);

create trigger supplier_member_invoices_set_updated_at
  before update on public.supplier_member_invoices
  for each row execute function public.set_updated_at();

-- Tax + total derive from subtotal + tax_rate (same rule as invoices).
create trigger supplier_member_invoices_amounts
  before insert or update on public.supplier_member_invoices
  for each row execute function public.compute_invoice_amounts();

-- --- supplier_member_invoice_items ----------------------------------

create table if not exists public.supplier_member_invoice_items (
  id                uuid primary key default gen_random_uuid(),
  member_invoice_id uuid not null references public.supplier_member_invoices (id) on delete cascade,
  centre            public.centre not null default 'MathVision',
  task              public.task_type not null default 'teaching',
  note              text,
  sessions          numeric(10,2) not null default 0,
  hours             numeric(10,2) not null default 0,
  rate_id           uuid references public.supplier_member_rates (id) on delete set null,
  rate_descriptor   text,
  rate_unit         public.rate_unit not null default 'per_session',
  rate_amount       numeric(14,2) not null default 0,
  line_total        numeric(14,2) not null default 0,
  sort_order        int not null default 0
);

create index if not exists smii_invoice_idx
  on public.supplier_member_invoice_items (member_invoice_id);

-- line_total is authoritative on the server (same rule as invoice_line_items).
create trigger smii_compute_total
  before insert or update on public.supplier_member_invoice_items
  for each row execute function public.compute_line_total();

-- Recompute the member invoice subtotal on any line change.
create or replace function public.recompute_member_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv uuid;
begin
  inv := coalesce(new.member_invoice_id, old.member_invoice_id);
  update public.supplier_member_invoices i
    set subtotal = coalesce(
      (select round(sum(line_total), 2)
         from public.supplier_member_invoice_items where member_invoice_id = inv),
      0
    )
  where i.id = inv;
  return null;
end;
$$;

drop trigger if exists smii_recompute on public.supplier_member_invoice_items;
create trigger smii_recompute
  after insert or update or delete on public.supplier_member_invoice_items
  for each row execute function public.recompute_member_invoice_subtotal();

-- --- consolidation link on the leader's invoice ---------------------
-- Marks a consolidated line as imported from a member invoice, so a re-pull
-- can replace member-sourced lines without touching the leader's own lines.

alter table public.invoice_line_items
  add column if not exists source_member_invoice_id uuid
  references public.supplier_member_invoices (id) on delete set null;

-- --- role / ownership helpers ---------------------------------------

create or replace function public.is_supplier_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'supplier_member'
  );
$$;

-- The supplier_members.id owned by the current login (null if not a member).
create or replace function public.my_supplier_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.supplier_members where profile_id = auth.uid();
$$;

create or replace function public.can_read_member_invoice(inv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.supplier_member_invoices i
    where i.id = inv
      and (
        public.is_hr()
        or i.supplier_id = public.my_team_member_id()          -- the leader
        or i.supplier_member_id = public.my_supplier_member_id() -- the member
      )
  );
$$;

create or replace function public.can_write_member_invoice(inv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.supplier_member_invoices i
    where i.id = inv
      and (
        public.is_hr()
        or (
          i.supplier_member_id = public.my_supplier_member_id()
          and i.status in ('draft', 'returned')
        )
      )
  );
$$;

-- --- guards: a member can only move draft<->submitted on their own ---

create or replace function public.enforce_member_invoice_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / HR: unrestricted. The supplier leader reaches this table
  -- only through SECURITY DEFINER RPCs (send-back / lock) — allow them too.
  if auth.uid() is null or public.is_hr() then
    return new;
  end if;
  if exists (
    select 1 from public.team_members t
    where t.id = new.supplier_id and t.profile_id = auth.uid()
  ) then
    return new;
  end if;

  -- otherwise the caller is the member editing their own invoice
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A member invoice must start as a draft';
    end if;
    return new;
  end if;

  if old.status = 'locked' then
    raise exception 'This submission is locked and can no longer be edited';
  end if;
  if new.status not in ('draft', 'submitted') then
    raise exception 'You are not allowed to set this status';
  end if;
  if new.supplier_member_id is distinct from old.supplier_member_id
     or new.supplier_id   is distinct from old.supplier_id
     or new.period_year   is distinct from old.period_year
     or new.period_month  is distinct from old.period_month
  then
    raise exception 'Submission identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists smi_write_guard on public.supplier_member_invoices;
create trigger smi_write_guard
  before insert or update on public.supplier_member_invoices
  for each row execute function public.enforce_member_invoice_write();

-- --- RLS ------------------------------------------------------------

alter table public.supplier_member_invoices enable row level security;

drop policy if exists smi_select on public.supplier_member_invoices;
create policy smi_select on public.supplier_member_invoices
  for select using (
    public.is_hr()
    or supplier_id = public.my_team_member_id()
    or supplier_member_id = public.my_supplier_member_id()
  );

drop policy if exists smi_insert on public.supplier_member_invoices;
create policy smi_insert on public.supplier_member_invoices
  for insert with check (
    public.is_hr()
    or supplier_member_id = public.my_supplier_member_id()
  );

-- The leader may update (send-back sets status/return_note); the member may
-- update their own; HR unrestricted. Field-level limits are enforced by the
-- guard trigger above.
drop policy if exists smi_update on public.supplier_member_invoices;
create policy smi_update on public.supplier_member_invoices
  for update using (
    public.is_hr()
    or supplier_id = public.my_team_member_id()
    or supplier_member_id = public.my_supplier_member_id()
  ) with check (
    public.is_hr()
    or supplier_id = public.my_team_member_id()
    or supplier_member_id = public.my_supplier_member_id()
  );

drop policy if exists smi_delete on public.supplier_member_invoices;
create policy smi_delete on public.supplier_member_invoices
  for delete using (
    public.is_hr()
    or (supplier_member_id = public.my_supplier_member_id() and status = 'draft')
  );

alter table public.supplier_member_invoice_items enable row level security;

drop policy if exists smii_select on public.supplier_member_invoice_items;
create policy smii_select on public.supplier_member_invoice_items
  for select using (public.can_read_member_invoice(member_invoice_id));

drop policy if exists smii_insert on public.supplier_member_invoice_items;
create policy smii_insert on public.supplier_member_invoice_items
  for insert with check (public.can_write_member_invoice(member_invoice_id));

drop policy if exists smii_update on public.supplier_member_invoice_items;
create policy smii_update on public.supplier_member_invoice_items
  for update using (public.can_write_member_invoice(member_invoice_id))
  with check (public.can_write_member_invoice(member_invoice_id));

drop policy if exists smii_delete on public.supplier_member_invoice_items;
create policy smii_delete on public.supplier_member_invoice_items
  for delete using (public.can_write_member_invoice(member_invoice_id));

-- Roster members may read their own supplier_member_rates (to pick a rate) and
-- their own supplier_members row. Extend the existing policies.
drop policy if exists sm_select on public.supplier_members;
create policy sm_select on public.supplier_members
  for select using (
    public.is_hr()
    or supplier_id = public.my_team_member_id()
    or profile_id = auth.uid()
  );

drop policy if exists smr_select on public.supplier_member_rates;
create policy smr_select on public.supplier_member_rates
  for select using (
    public.is_hr()
    or exists (
      select 1 from public.supplier_members sm
      where sm.id = supplier_member_id
        and (sm.supplier_id = public.my_team_member_id() or sm.profile_id = auth.uid())
    )
  );
