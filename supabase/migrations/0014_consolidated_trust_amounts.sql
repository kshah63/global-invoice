-- =====================================================================
-- Migration 0014: consolidated save trusts the line snapshot
--
-- With the new roster pay model, a member's pay is resolved server-side when
-- their own submission is saved (from their pay config), and the leader PULLS
-- those authoritative lines into the consolidated invoice. So the consolidated
-- save no longer re-resolves rates from supplier_member_rates (which the new
-- model doesn't populate) — it stores the line snapshot as-is. The leader is
-- the consolidator and HR still approves the result.
-- Depends on 0012/0013.
-- =====================================================================

create or replace function public.save_supplier_invoice(
  p_invoice      uuid,
  p_display_name text,
  p_ship_to      text,
  p_notes        text,
  p_tax_rate     numeric,
  p_items        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur_status  public.invoice_status;
  v_supplier  uuid;
begin
  select status, team_member_id into cur_status, v_supplier
    from public.invoices where id = p_invoice;
  if cur_status is null then
    raise exception 'Invoice not found';
  end if;

  update public.invoices set
    display_name    = coalesce(p_display_name, display_name),
    ship_to_address = p_ship_to,
    notes           = p_notes,
    tax_rate        = round(coalesce(p_tax_rate, 0), 3),
    status          = case when status = 'approved' then 'submitted'::public.invoice_status
                           else status end
  where id = p_invoice;

  delete from public.invoice_line_items where invoice_id = p_invoice;

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order,
     supplier_member_id, worked_by_name, source_member_invoice_id)
  select
    p_invoice,
    coalesce(nullif(it ->> 'centre', ''), 'MathVision')::public.centre,
    coalesce(nullif(it ->> 'task', ''), 'teaching')::public.task_type,
    nullif(it ->> 'note', ''),
    coalesce((it ->> 'sessions')::numeric, 0),
    coalesce((it ->> 'hours')::numeric, 0),
    null::uuid,
    coalesce(nullif(it ->> 'rate_descriptor', ''), 'Line'),
    coalesce(nullif(it ->> 'rate_unit', ''), 'per_session')::public.rate_unit,
    coalesce((it ->> 'rate_amount')::numeric, 0),
    coalesce((it ->> 'sort_order')::int, (ord - 1)::int),
    sm.id,
    sm.name,
    nullif(it ->> 'source_member_invoice_id', '')::uuid
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.supplier_members sm
    on sm.id = nullif(it ->> 'supplier_member_id', '')::uuid
    and sm.supplier_id = v_supplier;
end;
$$;
