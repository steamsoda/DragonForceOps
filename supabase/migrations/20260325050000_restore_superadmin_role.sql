-- Restore superadmin role for platform owner.
-- Idempotent — does nothing if already assigned.
insert into public.user_roles (user_id, role_id, campus_id)
select u.id, r.id, null
from auth.users u
join public.app_roles r on r.code = 'superadmin'
where u.email = 'javierg@dragonforcemty.com'
on conflict (user_id, role_id, campus_id) do nothing;
