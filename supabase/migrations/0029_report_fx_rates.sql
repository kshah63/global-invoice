-- =====================================================================
-- Migration 0029: Per-month report exchange rates.
--
-- Lets HR record, for a given month, how many units of each non-SGD
-- currency equal 1 SGD (e.g. 1 SGD = 62 INR). The payroll report uses
-- these to show a combined "Total (SGD)" across currencies. Rates are
-- keyed by (year, month, currency) so they persist per month and are not
-- lost when HR navigates between months.
-- =====================================================================

create table if not exists public.report_fx_rates (
  id            uuid primary key default gen_random_uuid(),
  year          int not null,
  month         int not null check (month between 1 and 12),
  currency      public.currency_code not null,
  units_per_sgd numeric(18, 6) not null check (units_per_sgd > 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,
  unique (year, month, currency)
);

alter table public.report_fx_rates enable row level security;

drop policy if exists report_fx_select on public.report_fx_rates;
create policy report_fx_select on public.report_fx_rates
  for select using (public.is_hr());

drop policy if exists report_fx_write on public.report_fx_rates;
create policy report_fx_write on public.report_fx_rates
  for all using (public.is_hr()) with check (public.is_hr());
