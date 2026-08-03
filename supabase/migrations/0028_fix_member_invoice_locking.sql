-- =====================================================================
-- Migration 0028: Stop stranding roster-member submissions, and recover
-- any that were already stranded.
--
-- Problem: lock_member_invoices_on_submit() locked EVERY member submission
-- for the period when the consolidated invoice was submitted — even ones
-- the leader never pulled in, and even drafts. A leader who submitted with
-- (say) only an expense claim would lock all their roster members: their pay
-- never made it onto the invoice, and the submissions could no longer be
-- pulled ('submitted'-only) or edited ('locked').
--
-- Fix (two parts):
--   1) The trigger now only locks submissions that are actually 'submitted'
--      (i.e. handed in), leaving drafts/returned alone. The app also auto-pulls
--      all submitted members on submit, so submitted == included.
--   2) Recover already-stranded submissions: any 'locked' submission that was
--      never pulled into a consolidated invoice line is returned to 'submitted'
--      so the leader can pull it in.
-- =====================================================================

-- 1) Only lock submissions that were handed in.
create or replace function public.lock_member_invoices_on_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('submitted', 'approved', 'locked', 'paid')
     and new.status is distinct from old.status
     and exists (
       select 1 from public.team_members t
       where t.id = new.team_member_id and t.member_type = 'supplier'
     )
  then
    update public.supplier_member_invoices
       set status = 'locked'
     where supplier_id = new.team_member_id
       and period_year = new.period_year
       and period_month = new.period_month
       and status = 'submitted';
  end if;
  return new;
end;
$$;

-- 2) Un-strand: locked submissions that were never pulled into a consolidated
--    invoice line go back to 'submitted' so they can be included.
update public.supplier_member_invoices mi
   set status = 'submitted'
 where mi.status = 'locked'
   and not exists (
     select 1
       from public.invoice_line_items li
      where li.source_member_invoice_id = mi.id
   );
