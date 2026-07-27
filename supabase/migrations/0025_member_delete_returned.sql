-- =====================================================================
-- Migration 0025: let a roster member delete a RETURNED submission
--
-- Previously a member could only delete their own 'draft'. A returned
-- submission is back in the member's hands, so allow deleting it too (e.g. to
-- start the month fresh). HR can already delete any non-locked submission.
-- =====================================================================

drop policy if exists smi_delete on public.supplier_member_invoices;
create policy smi_delete on public.supplier_member_invoices
  for delete using (
    public.is_hr()
    or (
      supplier_member_id = public.my_supplier_member_id()
      and status in ('draft', 'returned')
    )
  );
