-- =====================================================================
-- Migration 0023: repair roster-member roles
--
-- Any profile linked to a supplier_members row is a roster member and MUST have
-- role 'supplier_member' so they land on the /member portal. Some accounts ended
-- up as 'team_member' (the signup trigger's default) — e.g. recovered orphan
-- logins, where app_metadata was updated but the profile role was not. Repair
-- them. (The supplier LEADER is a team_members row, not supplier_members, so
-- leaders are untouched.)
-- =====================================================================

update public.profiles p
   set role = 'supplier_member'
  from public.supplier_members sm
 where sm.profile_id = p.id
   and p.role is distinct from 'supplier_member';
