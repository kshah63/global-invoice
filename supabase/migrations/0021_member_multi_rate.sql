-- =====================================================================
-- Migration 0021: multiple rates + subjects per roster member
--
--   * subjects column on supplier_members (which subjects they teach)
--   * backfill: existing single-rate members get one supplier_member_rates row
--     (rate members now hold 1+ rates there instead of the single rate_* cols)
--   * save_member_invoice rewritten to accept a worked quantity PER RATE, with
--     each rate resolved server-side from the member's own supplier_member_rates
--
-- supplier_member_rates + pull_member_invoices already support multiple base
-- lines (this reinstates the original multi-rate mechanism from 0011, which
-- 0013 had collapsed to a single rate). Depends on 0013.
-- =====================================================================

-- 1) Subjects a roster member teaches (mirrors team_members.subjects).
alter table public.supplier_members
  add column if not exists subjects text[] not null default '{}';

-- 2) Backfill: any rate member with a configured rate but no rate rows yet
--    gets one, so nothing loses its rate when the app switches to reading
--    supplier_member_rates.
insert into public.supplier_member_rates
  (supplier_member_id, descriptor, unit, amount, task, sort_order)
select
  sm.id,
  coalesce(nullif(sm.rate_descriptor, ''), 'Work'),
  coalesce(sm.rate_unit, 'per_session'),
  coalesce(sm.rate_amount, 0),
  sm.rate_task,
  0
from public.supplier_members sm
where sm.pay_type = 'rate'
  and coalesce(sm.rate_amount, 0) > 0
  and not exists (
    select 1 from public.supplier_member_rates r where r.supplier_member_id = sm.id
  );

-- 3) Member save: a worked quantity per rate. Base lines resolve their
--    unit/amount/descriptor/task from the member's own supplier_member_rates
--    (never trusted from the client). Fixed-salary members ignore p_lines.
drop function if exists public.save_member_invoice(uuid, text, text, numeric, jsonb);

create or replace function public.save_member_invoice(
  p_invoice      uuid,
  p_display_name text,
  p_notes        text,
  p_lines        jsonb,
  p_adjustments  jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur_status  public.member_invoice_status;
  v_member    uuid;
  v_pay_type  public.pay_type;
  v_salary    numeric;
  v_pay_ccy   public.currency_code;
  v_qty_total numeric;
begin
  select status, supplier_member_id into cur_status, v_member
    from public.supplier_member_invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  select pay_type, monthly_salary, payment_currency
    into v_pay_type, v_salary, v_pay_ccy
    from public.supplier_members where id = v_member;

  select coalesce(sum(coalesce((ln ->> 'quantity')::numeric, 0)), 0)
    into v_qty_total
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as t(ln);

  update public.supplier_member_invoices set
    display_name     = coalesce(p_display_name, display_name),
    notes            = p_notes,
    quantity         = case when v_pay_type = 'rate' then v_qty_total else 0 end,
    payment_currency = v_pay_ccy
  where id = p_invoice;

  delete from public.supplier_member_invoice_items where member_invoice_id = p_invoice;

  if v_pay_type = 'fixed' then
    insert into public.supplier_member_invoice_items
      (member_invoice_id, centre, task, note, sessions, hours,
       rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
    values
      (p_invoice, 'MathVision', 'fixed_salary', null, 0, 0,
       null, 'Monthly salary', 'fixed', coalesce(v_salary, 0), 0);
  else
    -- one base line per rate with a positive worked quantity
    insert into public.supplier_member_invoice_items
      (member_invoice_id, centre, task, note, sessions, hours,
       rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
    select
      p_invoice, 'MathVision', coalesce(r.task, 'teaching'::public.task_type), null,
      case when r.unit = 'per_session' then q.qty else 0 end,
      case when r.unit = 'per_hour' then q.qty else 0 end,
      r.id, r.descriptor, r.unit, r.amount,
      (row_number() over (order by r.sort_order, r.id))::int - 1
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as t(ln)
    join public.supplier_member_rates r
      on r.id = nullif(ln ->> 'rate_id', '')::uuid
      and r.supplier_member_id = v_member
    cross join lateral (select coalesce((ln ->> 'quantity')::numeric, 0) as qty) q
    where q.qty > 0;
  end if;

  -- adjustment lines (client-typed, may be negative) — kept after base lines
  insert into public.supplier_member_invoice_items
    (member_invoice_id, centre, task, note, sessions, hours,
     rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
  select
    p_invoice, 'MathVision', 'adjustment',
    nullif(a ->> 'note', ''), 0, 0, null,
    coalesce(nullif(a ->> 'rate_descriptor', ''), 'Adjustment'),
    'fixed', coalesce((a ->> 'rate_amount')::numeric, 0),
    100 + coalesce((a ->> 'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) with ordinality as t(a, ord);
end;
$$;
