-- =====================================================================
-- Migration 0013: member pay RPC + leader-edits-on-behalf permissions
--   save_member_invoice     — rewritten: the base line (salary or rate*qty)
--                             is resolved SERVER-SIDE from the member's pay
--                             config; the member only supplies the quantity
--                             (rate members) and adjustments.
--   can_write_member_invoice / RLS — the supplier leader can now create and
--                             edit a member's submission on their behalf.
-- Depends on 0012.
-- =====================================================================

-- Leader (supplier owner) may write a member's submission on their behalf.
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
        or (i.supplier_id = public.my_team_member_id() and i.status <> 'locked')
        or (
          i.supplier_member_id = public.my_supplier_member_id()
          and i.status in ('draft', 'returned')
        )
      )
  );
$$;

-- Let the leader insert a member submission on their behalf.
drop policy if exists smi_insert on public.supplier_member_invoices;
create policy smi_insert on public.supplier_member_invoices
  for insert with check (
    public.is_hr()
    or supplier_member_id = public.my_supplier_member_id()
    or supplier_id = public.my_team_member_id()
  );

-- --- Atomic save of a member submission ------------------------------
-- The base pay line is authoritative from the roster config; the client may
-- only set the worked quantity (rate members) and adjustment lines.

-- Drop the 0011 signature (uuid,text,text,jsonb) so only the new one exists.
drop function if exists public.save_member_invoice(uuid, text, text, jsonb);

create or replace function public.save_member_invoice(
  p_invoice      uuid,
  p_display_name text,
  p_notes        text,
  p_quantity     numeric,
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
  v_unit      public.rate_unit;
  v_amount    numeric;
  v_descr     text;
  v_task      public.task_type;
  v_pay_ccy   public.currency_code;
  v_qty       numeric := coalesce(p_quantity, 0);
begin
  select status, supplier_member_id into cur_status, v_member
    from public.supplier_member_invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  select pay_type, monthly_salary, rate_unit, rate_amount, rate_descriptor, rate_task, payment_currency
    into v_pay_type, v_salary, v_unit, v_amount, v_descr, v_task, v_pay_ccy
    from public.supplier_members where id = v_member;

  update public.supplier_member_invoices set
    display_name     = coalesce(p_display_name, display_name),
    notes            = p_notes,
    quantity         = case when v_pay_type = 'rate' then v_qty else 0 end,
    payment_currency = v_pay_ccy
  where id = p_invoice;

  delete from public.supplier_member_invoice_items where member_invoice_id = p_invoice;

  -- base pay line (resolved server-side)
  if v_pay_type = 'fixed' then
    insert into public.supplier_member_invoice_items
      (member_invoice_id, centre, task, note, sessions, hours,
       rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
    values
      (p_invoice, 'MathVision', 'fixed_salary', null, 0, 0,
       null, 'Monthly salary', 'fixed', coalesce(v_salary, 0), 0);
  else
    insert into public.supplier_member_invoice_items
      (member_invoice_id, centre, task, note, sessions, hours,
       rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
    values
      (p_invoice, 'MathVision', coalesce(v_task, 'teaching'), null,
       case when v_unit = 'per_session' then v_qty else 0 end,
       case when v_unit = 'per_hour' then v_qty else 0 end,
       null, coalesce(v_descr, 'Work'), coalesce(v_unit, 'per_hour'),
       coalesce(v_amount, 0), 0);
  end if;

  -- adjustment lines (client-typed, may be negative)
  insert into public.supplier_member_invoice_items
    (member_invoice_id, centre, task, note, sessions, hours,
     rate_id, rate_descriptor, rate_unit, rate_amount, sort_order)
  select
    p_invoice, 'MathVision', 'adjustment',
    nullif(a ->> 'note', ''), 0, 0, null,
    coalesce(nullif(a ->> 'rate_descriptor', ''), 'Adjustment'),
    'fixed', coalesce((a ->> 'rate_amount')::numeric, 0),
    1 + coalesce((a ->> 'sort_order')::int, (ord - 1)::int)
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) with ordinality as t(a, ord);
end;
$$;
