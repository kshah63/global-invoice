-- =====================================================================
-- Migration 0016: roster members log in by their 4-digit ID
-- Their code becomes globally unique (across all suppliers) so a bare ID
-- identifies the person at login. HR can create a member login without a real
-- email (a hidden placeholder is used for the auth account).
-- Depends on 0006/0010.
-- =====================================================================

-- Enforce global uniqueness of roster member codes. If this fails, two people
-- share a 4-digit ID across suppliers — make them unique first, then re-run.
create unique index if not exists supplier_members_code_global_key
  on public.supplier_members (code);
