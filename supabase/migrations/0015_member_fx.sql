-- =====================================================================
-- Migration 0015: record a roster member's actual payout FX rate
-- The supplier leader pays their own members, so they record the actual
-- rate + transfer date; HR can also step in. Until set, the member sees an
-- indicative amount at the live rate.
-- Depends on 0010/0012.
-- =====================================================================

create or replace function public.record_member_invoice_fx(
  p_invoice uuid,
  p_rate    numeric,
  p_date    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
begin
  select supplier_id into v_supplier
    from public.supplier_member_invoices where id = p_invoice;
  if v_supplier is null then
    raise exception 'Submission not found';
  end if;
  if not (public.is_hr() or v_supplier = public.my_team_member_id()) then
    raise exception 'Not allowed';
  end if;

  update public.supplier_member_invoices
     set fx_rate = p_rate, fx_rate_date = p_date
   where id = p_invoice;
end;
$$;
