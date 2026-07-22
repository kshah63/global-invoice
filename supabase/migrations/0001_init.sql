-- =====================================================================
-- Global Online Invoicing App — schema
-- Migration 0001: extensions, enums, tables, indexes, updated_at triggers
-- =====================================================================

create extension if not exists "pgcrypto";

-- --- Enums -----------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('hr', 'team_member', 'department_head');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.currency_code as enum ('SGD', 'INR', 'MYR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.centre as enum ('MathVision', 'StudyHub');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_type as enum ('teaching', 'teacher_training', 'paper_marking', 'fixed_salary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rate_unit as enum ('per_session', 'per_hour', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'submitted', 'approved', 'locked', 'paid');
exception when duplicate_object then null; end $$;

-- --- updated_at helper ----------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- profiles (one row per auth user) --------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'team_member',
  full_name   text,
  email       text not null,
  business    public.centre,           -- only used for department_head accounts
  created_at  timestamptz not null default now()
);

-- --- company_settings (single row; MathVision address, HR-editable) ---

create table if not exists public.company_settings (
  id              int primary key default 1,
  company_name    text not null default 'MathVision',
  address         text,
  email           text,
  phone           text,
  registration_no text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null,
  constraint company_settings_singleton check (id = 1)
);

-- --- team_members (HR-managed contractor records) --------------------

create table if not exists public.team_members (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid unique references public.profiles (id) on delete set null,
  name                 text not null,
  invoice_display_name text,
  use_hr_name          boolean not null default true,
  whatsapp_number      text,
  email                text not null,
  employee_id          text not null unique,
  date_joined          date,
  nationality          text,
  work_location        text,
  head_of_department   text,
  payment_details      text,
  currency             public.currency_code not null default 'SGD',
  ship_to_address      text,
  fixed_salary         numeric(14,2),
  subjects             text[] not null default '{}',
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint team_members_employee_id_format check (employee_id ~ '^[0-9]{4}$')
);

create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- --- team_member_rates (the conditional rate "descriptor" dropdown) ---

create table if not exists public.team_member_rates (
  id             uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  descriptor     text not null,
  unit           public.rate_unit not null default 'per_session',
  amount         numeric(14,2) not null default 0,
  task           public.task_type,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists team_member_rates_tm_idx
  on public.team_member_rates (team_member_id);

-- --- invoice_periods (months HR has opened) --------------------------

create table if not exists public.invoice_periods (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  month      int not null check (month between 1 and 12),
  is_open    boolean not null default true,
  opened_at  timestamptz default now(),
  opened_by  uuid references public.profiles (id) on delete set null,
  note       text,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- --- invoices --------------------------------------------------------

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  team_member_id   uuid not null references public.team_members (id) on delete cascade,
  period_year      int not null,
  period_month     int not null check (period_month between 1 and 12),
  invoice_number   text not null unique,
  status           public.invoice_status not null default 'draft',
  display_name     text not null,
  ship_to_address  text,
  currency         public.currency_code not null default 'SGD',
  company_snapshot jsonb,
  notes            text,
  subtotal         numeric(14,2) not null default 0,
  tax_rate         numeric(6,3)  not null default 0,   -- percentage
  tax_amount       numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  locked_at        timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (team_member_id, period_year, period_month)
);

create index if not exists invoices_tm_idx on public.invoices (team_member_id);
create index if not exists invoices_period_idx on public.invoices (period_year, period_month);
create index if not exists invoices_status_idx on public.invoices (status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- --- invoice_line_items ---------------------------------------------

create table if not exists public.invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  centre          public.centre not null default 'MathVision',
  task            public.task_type not null default 'teaching',
  note            text,
  sessions        numeric(10,2) not null default 0,
  hours           numeric(10,2) not null default 0,
  rate_id         uuid references public.team_member_rates (id) on delete set null,
  rate_descriptor text,
  rate_unit       public.rate_unit not null default 'per_session',
  rate_amount     numeric(14,2) not null default 0,
  line_total      numeric(14,2) not null default 0,
  sort_order      int not null default 0
);

create index if not exists line_items_invoice_idx
  on public.invoice_line_items (invoice_id);

-- --- department head checks (cross-check submissions) ----------------

create table if not exists public.dept_head_checks (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null references public.profiles (id) on delete cascade,
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  period_year    int not null,
  period_month   int not null check (period_month between 1 and 12),
  business       public.centre not null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (created_by, team_member_id, period_year, period_month)
);

create index if not exists dh_checks_tm_idx
  on public.dept_head_checks (team_member_id, period_year, period_month);

create trigger dh_checks_set_updated_at
  before update on public.dept_head_checks
  for each row execute function public.set_updated_at();

create table if not exists public.dept_head_check_items (
  id         uuid primary key default gen_random_uuid(),
  check_id   uuid not null references public.dept_head_checks (id) on delete cascade,
  task       public.task_type not null default 'teaching',
  note       text,
  sessions   numeric(10,2) not null default 0,
  hours      numeric(10,2) not null default 0,
  sort_order int not null default 0
);

create index if not exists dh_check_items_check_idx
  on public.dept_head_check_items (check_id);

-- --- messages (HR broadcasts to team members) -----------------------

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  sender_profile_id uuid references public.profiles (id) on delete set null,
  sender_name       text,
  period_year       int,
  period_month      int,
  subject           text not null,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index if not exists messages_created_idx
  on public.messages (created_at desc);

-- --- seed the singleton company settings row ------------------------

insert into public.company_settings (id, company_name)
values (1, 'MathVision')
on conflict (id) do nothing;
