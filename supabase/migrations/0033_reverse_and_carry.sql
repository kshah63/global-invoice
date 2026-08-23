-- =====================================================================
-- Migration 0033: reverse a bounced payment and carry it into next month.
--
-- Scenario: HR transferred a global employee their pay and marked the
-- invoice paid, but the bank reversed the transfer. The invoice itself was
-- correct — only the payment failed — so we don't rewrite last month's
-- numbers. Instead:
--   * last month's invoice moves to status 'reversed' (added in 0032):
--     closed, not counted as paid, not re-payable;
--   * the owed amount is carried into next month's invoice as a read-only,
--     HR-added line, tagged with source_reversed_invoice_id;
--   * next month's draft is created if it doesn't exist yet, so the amount
--     is waiting for the employee ("autopopulates").
-- This shifts the owed amount one month with no double-count — the same
-- net-zero idea as bundling (0030).
--
-- Adds:
--   * invoice_line_items.source_reversed_invoice_id — tags the carry line
--   * invoices.carried_to_invoice_id / reversed_at   — the flag on the source
--   * save_invoice — preserves carry lines on a normal (employee) save
--   * set_invoice_status_timestamps — treats 'reversed' as post-paid
--   * enforce_invoice_update — a 'reversed' invoice is locked to non-HR
--   * reverse_and_carry_invoice / undo_reverse_and_carry — HR RPCs
-- Depends on 0032 (the 'reversed' enum value) and 0027 (save_invoice).
-- =====================================================================

alter table public.invoice_line_items
  add column if not exists source_reversed_invoice_id uuid
    references public.invoices (id) on delete set null;

alter table public.invoices
  add column if not exists carried_to_invoice_id uuid
    references public.invoices (id) on delete set null,
  add column if not exists reversed_at timestamptz;

-- --- save_invoice: preserve carry-forward lines on an employee save ----
-- Same as 0027, but the wipe excludes carry lines (source_reversed_invoice_id)
-- so the employee editing their own work never drops HR's carried entry.
create or replace function public.save_invoice(
  p_invoice     uuid,
  p_display_name text,
  p_ship_to     text,
  p_notes       text,
  p_tax_rate    numeric,
  p_items       jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur_status public.invoice_status;
  v_team     uuid;
  v_fixed    numeric;
begin
  select status, team_member_id into cur_status, v_team
    from public.invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  select fixed_salary into v_fixed from public.team_members where id = v_team;

  if (
    select count(*) from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where e ->> 'task' = 'fixed_salary'
  ) > 1 then
    raise exception 'An invoice can only have one fixed salary line';
  end if;

  update public.invoices set
    display_name    = coalesce(p_display_name, display_name),
    ship_to_address = p_ship_to,
    notes           = p_notes,
    tax_rate        = round(coalesce(p_tax_rate, 0), 3),
    status          = case when status = 'approved' then 'submitted'::public.invoice_status
                           else status end
  where id = p_invoice;

  -- Carry-forward lines are HR-owned and preserved across employee saves.
  delete from public.invoice_line_items
    where invoice_id = p_invoice and source_reversed_invoice_id is null;

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order)
  select
    p_invoice,
    coalesce(nullif(it ->> 'centre', ''), 'MathVision')::public.centre,
    coalesce(nullif(it ->> 'task', ''), 'teaching')::public.task_type,
    nullif(it ->> 'note', ''),
    coalesce((it ->> 'sessions')::numeric, 0),
    coalesce((it ->> 'hours')::numeric, 0),
    case when (it ->> 'task') = 'adjustment' then null::uuid else r.id end,
    case when (it ->> 'task') = 'fixed_salary' then 'Fixed salary'
         when (it ->> 'task') = 'adjustment'
           then coalesce(nullif(it ->> 'rate_descriptor', ''), 'Adjustment')
         else r.descriptor end,
    case when (it ->> 'task') in ('fixed_salary', 'adjustment') then 'fixed'::public.rate_unit
         else coalesce(r.unit, 'per_session'::public.rate_unit) end,
    case when (it ->> 'task') = 'fixed_salary' then coalesce(v_fixed, 0)
         when (it ->> 'task') = 'adjustment' then coalesce((it ->> 'rate_amount')::numeric, 0)
         else coalesce(r.amount, 0) end,
    coalesce((it ->> 'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.team_member_rates r
    on r.id = nullif(it ->> 'rate_id', '')::uuid
    and r.team_member_id = v_team;
end;
$$;

-- --- status timestamps: treat 'reversed' as a post-paid state ----------
-- A reversed invoice was submitted, approved and paid before the transfer
-- bounced, so it should keep all of those timestamps (and restore cleanly
-- on undo). Same as 0002 but with 'reversed' added to each list.
create or replace function public.set_invoice_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.submitted_at := case
    when new.status in ('submitted', 'approved', 'locked', 'paid', 'reversed')
      then coalesce(new.submitted_at, now()) else null end;
  new.approved_at := case
    when new.status in ('approved', 'locked', 'paid', 'reversed')
      then coalesce(new.approved_at, now()) else null end;
  new.locked_at := case
    when new.status in ('locked', 'paid', 'reversed')
      then coalesce(new.locked_at, now()) else null end;
  new.paid_at := case
    when new.status in ('paid', 'reversed')
      then coalesce(new.paid_at, now()) else null end;
  return new;
end;
$$;

-- --- update guard: a reversed invoice is locked to non-HR --------------
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

  if old.status in ('locked', 'paid', 'reversed') then
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

-- --- reverse a bounced payment and carry it into next month -----------
create or replace function public.reverse_and_carry_invoice(
  p_invoice uuid,
  p_amount  numeric default null,
  p_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src           public.invoices;
  v_tm            public.team_members;
  v_amount        numeric;
  v_ty            int;
  v_tmonth        int;
  v_period_open   boolean;
  v_target        uuid;
  v_target_status public.invoice_status;
  v_company       jsonb;
  v_idpart        text;
  v_note          text;
begin
  if not public.is_hr() then
    raise exception 'Only HR can carry a reversed payment forward';
  end if;

  select * into v_src from public.invoices where id = p_invoice;
  if v_src.id is null then raise exception 'Invoice not found'; end if;
  if v_src.bundled_into_invoice_id is not null then
    raise exception 'This invoice is part of a supplier bulk transfer; handle the reversal there';
  end if;
  if v_src.carried_to_invoice_id is not null then
    raise exception 'This invoice has already been carried forward';
  end if;
  if v_src.status <> 'paid' then
    raise exception 'Only a paid invoice can be reversed and carried forward';
  end if;

  select * into v_tm from public.team_members where id = v_src.team_member_id;
  if v_tm.id is null then raise exception 'Team member not found'; end if;
  if v_tm.member_type = 'supplier' then
    raise exception 'Carry-forward is for individual invoices only';
  end if;

  v_amount := round(coalesce(nullif(p_amount, 0), v_src.total), 2);
  if v_amount <= 0 then
    raise exception 'The amount to carry must be greater than zero';
  end if;
  if v_amount > v_src.total + 0.005 then
    raise exception 'The amount to carry cannot exceed the invoice total';
  end if;

  -- next month (with year rollover)
  if v_src.period_month = 12 then
    v_ty := v_src.period_year + 1;
    v_tmonth := 1;
  else
    v_ty := v_src.period_year;
    v_tmonth := v_src.period_month + 1;
  end if;

  select is_open into v_period_open from public.invoice_periods
    where year = v_ty and month = v_tmonth;
  if v_period_open is distinct from true then
    raise exception 'Open % for invoicing before carrying this forward',
      to_char(make_date(v_ty, v_tmonth, 1), 'Mon YYYY');
  end if;

  -- find or create next month's invoice for this employee
  select id, status into v_target, v_target_status from public.invoices
    where team_member_id = v_src.team_member_id
      and period_year = v_ty and period_month = v_tmonth;

  if v_target is null then
    v_company := v_src.company_snapshot;
    if v_company is null then
      select jsonb_build_object(
        'company_name', company_name, 'address', address, 'email', email,
        'phone', phone, 'registration_no', registration_no)
        into v_company from public.company_settings where id = 1;
    end if;
    v_idpart := coalesce(nullif(v_tm.employee_id, ''), '0000');
    insert into public.invoices (
      team_member_id, period_year, period_month, invoice_number, status,
      display_name, ship_to_address, currency, company_snapshot, tax_rate
    ) values (
      v_src.team_member_id, v_ty, v_tmonth,
      'INV-' || v_idpart || '-' || v_ty || '-' || lpad(v_tmonth::text, 2, '0'),
      'draft'::public.invoice_status,
      case when v_tm.use_hr_name then v_tm.name
           else coalesce(nullif(v_tm.invoice_display_name, ''), v_tm.name) end,
      v_tm.ship_to_address, v_src.currency, v_company, 0
    ) returning id into v_target;
  else
    if v_target_status in ('paid', 'reversed') then
      raise exception 'Next month''s invoice is already %, so the amount can''t be added automatically', v_target_status;
    end if;
    -- adding content to an approved invoice sends it back for re-approval
    if v_target_status = 'approved' then
      update public.invoices set status = 'submitted'::public.invoice_status where id = v_target;
    end if;
  end if;

  v_note := coalesce(nullif(p_note, ''),
    'Bank reversal — carried forward from ' || v_src.invoice_number);

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order, source_reversed_invoice_id)
  values
    (v_target, 'MathVision'::public.centre, 'adjustment'::public.task_type, v_note,
     0, 0, null,
     'Carried forward from ' || v_src.invoice_number,
     'fixed'::public.rate_unit, v_amount, 0, p_invoice);

  update public.invoices
     set status = 'reversed'::public.invoice_status,
         carried_to_invoice_id = v_target,
         reversed_at = now()
   where id = p_invoice;

  return v_target;
end;
$$;

-- --- undo a carry-forward --------------------------------------------
create or replace function public.undo_reverse_and_carry(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src           public.invoices;
  v_target_status public.invoice_status;
begin
  if not public.is_hr() then
    raise exception 'Only HR can undo a carry-forward';
  end if;

  select * into v_src from public.invoices where id = p_invoice;
  if v_src.id is null then raise exception 'Invoice not found'; end if;
  if v_src.status <> 'reversed' then
    raise exception 'This invoice is not marked reversed';
  end if;

  if v_src.carried_to_invoice_id is not null then
    select status into v_target_status from public.invoices
      where id = v_src.carried_to_invoice_id;
    if v_target_status = 'paid' then
      raise exception 'Next month''s invoice has already been paid — cannot undo';
    end if;
    delete from public.invoice_line_items
      where invoice_id = v_src.carried_to_invoice_id
        and source_reversed_invoice_id = p_invoice;
  end if;

  update public.invoices
     set status = 'paid'::public.invoice_status,
         carried_to_invoice_id = null,
         reversed_at = null
   where id = p_invoice;
end;
$$;
