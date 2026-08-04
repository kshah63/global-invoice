-- =====================================================================
-- Migration 0030: Bundle an individual's invoice into a supplier invoice.
--
-- HR can "move" an individual's monthly invoice onto a supplier's invoice
-- so it's paid in one bulk international transfer (saving fees). The
-- individual's amount (in their currency, normally SGD) is converted into
-- the supplier's currency using that month's report exchange rate and added
-- as a separate line item. The individual invoice is flagged so it is paid
-- via the supplier and never counted twice.
--
--   * invoice_line_items.source_individual_invoice_id — tags the bundled line
--   * invoices.bundled_into_invoice_id / bundled_rate / bundled_sgd_amount —
--     the flag + snapshot on the individual invoice
--   * save_supplier_invoice — preserves bundled lines on a normal save
--   * bundle_individual_invoice / unbundle_individual_invoice — HR RPCs
--   * propagate_bundle_payment — bundled individuals follow the supplier's
--     paid status
-- Depends on 0019 (save_supplier_invoice) and 0029 (report_fx_rates).
-- =====================================================================

alter table public.invoice_line_items
  add column if not exists source_individual_invoice_id uuid
    references public.invoices (id) on delete set null;

alter table public.invoices
  add column if not exists bundled_into_invoice_id uuid
    references public.invoices (id) on delete set null,
  add column if not exists bundled_rate numeric(18, 6),
  add column if not exists bundled_sgd_amount numeric(14, 2);

-- --- save_supplier_invoice: preserve bundled lines on save ------------
-- Same as 0019, but the wipe excludes bundled (source_individual) lines so a
-- leader/HR save of the supplier's own lines never drops HR's bundled entries.
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

  delete from public.invoice_line_items
    where invoice_id = p_invoice and source_individual_invoice_id is null;

  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order,
     supplier_member_id, worked_by_name, source_member_invoice_id, receipt_path)
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
    nullif(it ->> 'source_member_invoice_id', '')::uuid,
    nullif(it ->> 'receipt_path', '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(it, ord)
  left join public.supplier_members sm
    on sm.id = nullif(it ->> 'supplier_member_id', '')::uuid
    and sm.supplier_id = v_supplier;
end;
$$;

-- --- bundle an individual invoice into a supplier invoice -------------
create or replace function public.bundle_individual_invoice(
  p_individual        uuid,
  p_supplier_invoice  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind_status  public.invoice_status;
  v_ind_cur     text;
  v_ind_total   numeric;
  v_ind_number  text;
  v_ind_name    text;
  v_ind_year    int;
  v_ind_month   int;
  v_ind_bundled uuid;
  v_sup_status  public.invoice_status;
  v_sup_cur     text;
  v_sup_year    int;
  v_sup_month   int;
  v_is_supplier boolean;
  v_ind_rate    numeric;
  v_sup_rate    numeric;
  v_sgd         numeric;
  v_converted   numeric;
begin
  if not public.is_hr() then raise exception 'Not allowed'; end if;

  select i.status, i.currency::text, i.total, i.invoice_number,
         i.period_year, i.period_month, i.bundled_into_invoice_id, tm.name
    into v_ind_status, v_ind_cur, v_ind_total, v_ind_number,
         v_ind_year, v_ind_month, v_ind_bundled, v_ind_name
    from public.invoices i
    join public.team_members tm on tm.id = i.team_member_id
   where i.id = p_individual;
  if v_ind_status is null then raise exception 'Individual invoice not found'; end if;

  select i.status, i.currency::text, i.period_year, i.period_month,
         (tm.member_type = 'supplier')
    into v_sup_status, v_sup_cur, v_sup_year, v_sup_month, v_is_supplier
    from public.invoices i
    join public.team_members tm on tm.id = i.team_member_id
   where i.id = p_supplier_invoice;
  if v_sup_status is null then raise exception 'Supplier invoice not found'; end if;
  if not v_is_supplier then raise exception 'Target is not a supplier invoice'; end if;

  if v_ind_year <> v_sup_year or v_ind_month <> v_sup_month then
    raise exception 'The two invoices are for different months';
  end if;
  if v_ind_status not in ('approved', 'locked', 'paid') then
    raise exception 'The individual invoice must be approved before bundling';
  end if;
  if v_sup_status = 'paid' then
    raise exception 'The supplier invoice is already paid';
  end if;
  if v_ind_bundled is not null and v_ind_bundled <> p_supplier_invoice then
    raise exception 'This individual invoice is already bundled into another invoice';
  end if;

  -- Rates are "units of currency per 1 SGD" (SGD itself = 1).
  if v_ind_cur = 'SGD' then
    v_ind_rate := 1;
  else
    select units_per_sgd into v_ind_rate from public.report_fx_rates
      where year = v_sup_year and month = v_sup_month and currency::text = v_ind_cur;
    if v_ind_rate is null then
      raise exception 'No % exchange rate set for this month — set it in Reports first', v_ind_cur;
    end if;
  end if;
  if v_sup_cur = 'SGD' then
    v_sup_rate := 1;
  else
    select units_per_sgd into v_sup_rate from public.report_fx_rates
      where year = v_sup_year and month = v_sup_month and currency::text = v_sup_cur;
    if v_sup_rate is null then
      raise exception 'No % exchange rate set for this month — set it in Reports first', v_sup_cur;
    end if;
  end if;

  v_sgd       := v_ind_total / v_ind_rate;        -- individual amount in SGD
  v_converted := round(v_sgd * v_sup_rate, 2);    -- in the supplier's currency

  -- Upsert the bundled line (delete-then-insert makes re-sync idempotent).
  delete from public.invoice_line_items
    where invoice_id = p_supplier_invoice and source_individual_invoice_id = p_individual;
  insert into public.invoice_line_items
    (invoice_id, centre, task, note, sessions, hours, rate_id,
     rate_descriptor, rate_unit, rate_amount, sort_order,
     supplier_member_id, worked_by_name, source_individual_invoice_id)
  values
    (p_supplier_invoice, 'MathVision', 'adjustment', null, 0, 0, null,
     v_ind_name || ' · ' || v_ind_number, 'fixed', v_converted,
     900 + (select count(*) from public.invoice_line_items
              where invoice_id = p_supplier_invoice and source_individual_invoice_id is not null),
     null, v_ind_name, p_individual);

  update public.invoices
     set bundled_into_invoice_id = p_supplier_invoice,
         bundled_rate            = v_sup_rate,
         bundled_sgd_amount      = v_sgd,
         status = case when v_sup_status = 'paid' then 'paid'::public.invoice_status else status end
   where id = p_individual;
end;
$$;

-- --- un-bundle -------------------------------------------------------
create or replace function public.unbundle_individual_invoice(p_individual uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sup        uuid;
  v_sup_status public.invoice_status;
begin
  if not public.is_hr() then raise exception 'Not allowed'; end if;
  select bundled_into_invoice_id into v_sup from public.invoices where id = p_individual;
  if v_sup is null then return; end if;
  select status into v_sup_status from public.invoices where id = v_sup;
  if v_sup_status = 'paid' then
    raise exception 'The supplier invoice is already paid — cannot un-bundle';
  end if;
  delete from public.invoice_line_items
    where invoice_id = v_sup and source_individual_invoice_id = p_individual;
  update public.invoices
     set bundled_into_invoice_id = null, bundled_rate = null, bundled_sgd_amount = null
   where id = p_individual;
end;
$$;

-- --- bundled individuals follow the supplier's paid status ------------
create or replace function public.propagate_bundle_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and new.status is distinct from old.status then
    update public.invoices set status = 'paid'
      where bundled_into_invoice_id = new.id and status <> 'paid';
  elsif old.status = 'paid' and new.status <> 'paid' then
    update public.invoices set status = 'approved'
      where bundled_into_invoice_id = new.id and status = 'paid';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_propagate_bundle on public.invoices;
create trigger invoices_propagate_bundle
  after update on public.invoices
  for each row execute function public.propagate_bundle_payment();
