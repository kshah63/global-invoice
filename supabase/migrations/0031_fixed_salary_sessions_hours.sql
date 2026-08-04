-- =====================================================================
-- Migration 0031: record sessions/hours on a fixed-salary member line.
--
-- Fixed-salary teachers still need to log the sessions and hours they
-- worked (for cross-checking against the teaching tracker), even though it
-- doesn't change their pay. save_member_invoice gains two optional params
-- that are stored on the fixed_salary base line. Rate members are unchanged.
-- Depends on 0021 (save_member_invoice).
-- =====================================================================

drop function if exists public.save_member_invoice(uuid, text, text, jsonb, jsonb);

create or replace function public.save_member_invoice(
  p_invoice        uuid,
  p_display_name   text,
  p_notes          text,
  p_lines          jsonb,
  p_adjustments    jsonb,
  p_fixed_sessions numeric default 0,
  p_fixed_hours    numeric default 0
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
      (p_invoice, 'MathVision', 'fixed_salary', null,
       coalesce(p_fixed_sessions, 0), coalesce(p_fixed_hours, 0),
       null, 'Monthly salary', 'fixed', coalesce(v_salary, 0), 0);
  else
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
