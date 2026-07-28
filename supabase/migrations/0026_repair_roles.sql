-- =====================================================================
-- Migration 0026: repair account roles
--
-- The signup trigger derives profiles.role from app_metadata at creation, but
-- occasionally the role didn't stick and the account defaulted to 'team_member'
-- — sending department heads (and others) to the wrong portal with
-- "Profile not linked".
--
--  1) Sync profiles.role from auth.users.app_metadata (HR/seed always set that
--     correctly; only the service role can write it, so it's authoritative).
--  2) Anyone with a login_code is a department head (login_code is only set for
--     department heads), so force that even if app_metadata is also wrong.
-- =====================================================================

-- 1) Trust app_metadata.
update public.profiles p
   set role = (u.raw_app_meta_data ->> 'role')::public.user_role
  from auth.users u
 where u.id = p.id
   and (u.raw_app_meta_data ->> 'role') in
       ('hr', 'team_member', 'department_head', 'supplier_member')
   and p.role is distinct from (u.raw_app_meta_data ->> 'role')::public.user_role;

-- 2) Department heads are the profiles that carry a login_code.
update public.profiles
   set role = 'department_head'
 where login_code is not null
   and role is distinct from 'department_head';
