-- =====================================================================
-- Migration 0009: supplier_member login role
-- Roster members can now have their own login (set up by HR). They enter
-- their own work + adjustments and submit to their supplier leader, who
-- consolidates into the invoice to MathVision.
--
-- This is split out on its own because a new enum value must be committed
-- before it can be referenced (by the helper functions / policies in 0010).
-- Run this file first, then 0010.
-- =====================================================================

alter type public.user_role add value if not exists 'supplier_member';
