-- =====================================================================
-- Migration 0027: Repair save_invoice for individual "adjustment" /
-- "other charge" lines.
--
-- Symptom: adding an other-charge/adjustment on an individual invoice
-- saved a $0 amount — the typed amount was lost on reload.
--
-- Cause: some databases are still running the ORIGINAL save_invoice
-- (migration 0004), which resolves every line's amount server-side from
-- the team member's configured rates. An adjustment line has no rate, so
-- coalesce(r.amount, 0) stored 0. Migration 0008 taught the function about
-- adjustment lines, but where 0007/0008 were skipped (the same reason the
-- 'adjustment' enum value had to be re-added in 0024) the fix never landed.
--
-- This migration re-applies the correct definition idempotently, so the
-- typed amount/description are persisted for adjustment lines regardless of
-- which historical version a database currently has.
-- =====================================================================

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

  -- A fixed salary is a single monthly amount — allow at most one such line.
  if (
    select count(*) from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where e ->> 'task' = 'fixed_salary'
  ) > 1 then
    raise exception 'An invoice can only have one fixed salary line';
  end if;

  -- Editing an approved invoice sends it back to "submitted" for re-approval.
  update public.invoices set
    display_name    = coalesce(p_display_name, display_name),
    ship_to_address = p_ship_to,
    notes           = p_notes,
    tax_rate        = round(coalesce(p_tax_rate, 0), 3),
    status          = case when status = 'approved' then 'submitted'::public.invoice_status
                           else status end
  where id = p_invoice;

  delete from public.invoice_line_items where invoice_id = p_invoice;

  -- Rate amount/unit/descriptor are resolved SERVER-SIDE from the team member's
  -- configured rates (or fixed salary), never trusted from the client, so a
  -- client cannot inflate line totals. The two exceptions are the profile fixed
  -- salary and "adjustment" lines (an addition/deduction the member types in,
  -- surfaced in the UI as "Other charge"), both stored as a 'fixed' unit with a
  -- signed rate_amount. sessions/hours are the only other quantities from input.
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
