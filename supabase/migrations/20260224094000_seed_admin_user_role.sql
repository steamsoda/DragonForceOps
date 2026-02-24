-- Seed director_admin role for initial platform admin.
-- Requires that the user already exists in auth.users (after first login/signup).

insert into public.user_roles (user_id, role_id, campus_id)
select
  u.id,
  r.id,
  null
from auth.users u
join public.app_roles r on r.code = 'director_admin'
where u.email = 'javierg@dragonforcemty.com'
on conflict (user_id, role_id, campus_id) do nothing;
