-- =====================================================================
-- Migration 0002: helper functions + integrity triggers
-- =====================================================================

-- --- New auth user -> profile row -----------------------------------
-- IMPORTANT: the role is taken from raw_app_meta_data (app_metadata), which
-- ONLY the service role can set (via the admin createUser API used by HR and
-- the seed script). It is NOT taken from raw_user_meta_data, which is
-- client-controllable at signup and would otherwise allow anyone to
-- self-register as 'hr'. Any account without an app_metadata role defaults to
-- the least-privileged 'team_member'. full_name/business are non-privileged
-- and may come from user_metadata.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name, business)
  values (
    new.id,
    new.email,
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'team_member'),
    new.raw_user_meta_data ->> 'full_name',
    case
      when new.raw_user_meta_data ? 'business'
        and coalesce(new.raw_user_meta_data ->> 'business', '') <> ''
      then (new.raw_user_meta_data ->> 'business')::public.centre
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Role helpers (SECURITY DEFINER -> bypass RLS, avoid recursion) --

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'hr'
  );
$$;

create or replace function public.is_dept_head()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'department_head'
  );
$$;

-- The team_members.id owned by the current user (null if not a team member).
create or replace function public.my_team_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.team_members where profile_id = auth.uid();
$$;

-- --- Line total is authoritative on the server ----------------------
-- Recomputed from unit/amount/sessions/hours so a client can never post an
-- arbitrary total.

create or replace function public.compute_line_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total := case new.rate_unit
    when 'per_session' then round(coalesce(new.sessions, 0) * coalesce(new.rate_amount, 0), 2)
    when 'per_hour'    then round(coalesce(new.hours, 0) * coalesce(new.rate_amount, 0), 2)
    when 'fixed'       then round(coalesce(new.rate_amount, 0), 2)
    else 0
  end;
  return new;
end;
$$;

drop trigger if exists line_items_compute_total on public.invoice_line_items;
create trigger line_items_compute_total
  before insert or update on public.invoice_line_items
  for each row execute function public.compute_line_total();

-- --- Invoice subtotal recompute on any line-item change -------------

create or replace function public.recompute_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv uuid;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  update public.invoices i
    set subtotal = coalesce(
      (select round(sum(line_total), 2) from public.invoice_line_items where invoice_id = inv),
      0
    )
  where i.id = inv;
  return null;
end;
$$;

drop trigger if exists line_items_recompute on public.invoice_line_items;
create trigger line_items_recompute
  after insert or update or delete on public.invoice_line_items
  for each row execute function public.recompute_invoice_subtotal();

-- --- Tax + total always derived from subtotal + tax_rate ------------
-- (tax line sits before the total, per the invoice spec)

create or replace function public.compute_invoice_amounts()
returns trigger
language plpgsql
as $$
begin
  new.tax_amount := round(coalesce(new.subtotal, 0) * coalesce(new.tax_rate, 0) / 100.0, 2);
  new.total := round(coalesce(new.subtotal, 0) + new.tax_amount, 2);
  return new;
end;
$$;

drop trigger if exists invoices_compute_amounts on public.invoices;
create trigger invoices_compute_amounts
  before insert or update on public.invoices
  for each row execute function public.compute_invoice_amounts();

-- --- Status timestamps are derived from status ----------------------
-- Set when a status is first entered; cleared when the invoice moves back
-- below that status. This makes the timestamps authoritative (a client can
-- never set paid_at) and prevents a reverted invoice from showing a stale
-- "Paid"/"Locked" date.

create or replace function public.set_invoice_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.submitted_at := case
    when new.status in ('submitted', 'approved', 'locked', 'paid')
      then coalesce(new.submitted_at, now()) else null end;
  new.approved_at := case
    when new.status in ('approved', 'locked', 'paid')
      then coalesce(new.approved_at, now()) else null end;
  new.locked_at := case
    when new.status in ('locked', 'paid')
      then coalesce(new.locked_at, now()) else null end;
  new.paid_at := case
    when new.status = 'paid'
      then coalesce(new.paid_at, now()) else null end;
  return new;
end;
$$;

drop trigger if exists invoices_status_timestamps on public.invoices;
create trigger invoices_status_timestamps
  before insert or update on public.invoices
  for each row execute function public.set_invoice_status_timestamps();
