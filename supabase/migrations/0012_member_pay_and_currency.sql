-- =====================================================================
-- Migration 0012: roster pay model + rate/payment currencies
--
-- Roster members are employees: each is EITHER a fixed monthly salary OR a
-- single session/hour rate (HR-set). They confirm/enter their own figure and
-- add adjustments; the leader can also fill it in on their behalf.
--
-- Currency: a person's amounts are invoiced in their RATE currency (for a
-- supplier member that's the supplier's currency; for an individual it's their
-- existing `currency`). They may be PAID in a different currency — we show an
-- indicative converted amount and let HR record the actual rate at payout.
-- =====================================================================

do $$ begin
  create type public.pay_type as enum ('fixed', 'rate');
exception when duplicate_object then null; end $$;

-- --- roster member: single pay config + payout currency -------------

alter table public.supplier_members
  add column if not exists pay_type public.pay_type not null default 'rate';
alter table public.supplier_members
  add column if not exists monthly_salary numeric(14,2);
alter table public.supplier_members
  add column if not exists rate_unit public.rate_unit not null default 'per_hour';
alter table public.supplier_members
  add column if not exists rate_amount numeric(14,2) not null default 0;
alter table public.supplier_members
  add column if not exists rate_descriptor text;
alter table public.supplier_members
  add column if not exists rate_task public.task_type;
-- payout currency (null = same as the supplier's rate currency)
alter table public.supplier_members
  add column if not exists payment_currency public.currency_code;

-- --- individual team member: payout currency -----------------------
-- Their `currency` stays the rate/invoice currency; this is only the payout.
alter table public.team_members
  add column if not exists payment_currency public.currency_code;

-- --- member submission: quantity + payout snapshot + actual FX -----

alter table public.supplier_member_invoices
  add column if not exists quantity numeric(10,2) not null default 0; -- sessions/hours (rate members)
alter table public.supplier_member_invoices
  add column if not exists payment_currency public.currency_code;      -- snapshot at submit
alter table public.supplier_member_invoices
  add column if not exists fx_rate numeric(18,6);                      -- actual rate HR recorded
alter table public.supplier_member_invoices
  add column if not exists fx_rate_date date;

-- --- individual invoice: payout snapshot + actual FX ---------------

alter table public.invoices
  add column if not exists payment_currency public.currency_code;
alter table public.invoices
  add column if not exists fx_rate numeric(18,6);
alter table public.invoices
  add column if not exists fx_rate_date date;
