-- =====================================================================
-- Migration 0019: expense-claim receipts
--
-- Turns the supplier "Misc. Expenses" catch-all into a proper Expense claim:
--   * a private `receipts` storage bucket for uploaded proof,
--   * a receipt_path column on invoice line items,
--   * save_supplier_invoice threads receipt_path through the line snapshot.
--
-- The mandatory-description + mandatory-receipt rules are enforced in the app
-- (client + the submit server action, which also verifies the file exists).
-- Access to receipt files is brokered server-side with signed URLs, so no
-- storage RLS policies are required — the bucket is private.
-- Depends on 0014 (save_supplier_invoice).
-- =====================================================================

-- 1) Private bucket for receipts (guarded so this migration also runs in
--    environments without the Supabase `storage` schema, e.g. local checks).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'receipts', 'receipts', false, 10485760,
      array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
    )
    on conflict (id) do update set
      public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- 2) Store the uploaded receipt's storage path on the line item.
alter table public.invoice_line_items
  add column if not exists receipt_path text;

-- 3) save_supplier_invoice: carry receipt_path from the client snapshot.
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
