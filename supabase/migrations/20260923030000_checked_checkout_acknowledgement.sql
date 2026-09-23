create or replace function public.acknowledge_explicit_cart(p_actor uuid,p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare intent public.explicit_cart_intents; student_campus uuid;
begin
  perform public.assert_invicta_account_access();
  if auth.role() is distinct from 'service_role'
    or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
      and (banned_until is null or banned_until<=now()))
    or exists(select 1 from public.invicta_account_blocks where user_id=p_actor) then
    raise exception 'forbidden';
  end if;
  select * into intent from public.explicit_cart_intents where id=p_request and actor_id=p_actor for update;
  if not found then raise exception 'acknowledgement_unconfirmed'; end if;
  select campus_id into student_campus from public.enrollments where id=intent.enrollment_id;
  if exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id
      where u.user_id=p_actor and r.code in ('director_readonly','porto_viewer'))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id
      where u.user_id=p_actor and (r.code in ('superadmin','director_admin')
        or (r.code='front_desk' and u.campus_id=student_campus and u.campus_id=intent.campus_id))) then
    raise exception 'forbidden';
  end if;
  if intent.state='failed' or not exists(select 1 from public.explicit_cart_checkouts c
    where c.id=p_request and c.actor_id=p_actor and c.enrollment_id=intent.enrollment_id and c.campus_id=intent.campus_id) then
    raise exception 'acknowledgement_unconfirmed';
  end if;
  update public.explicit_cart_intents set state='completed' where id=p_request and state='pending';
end $$;
revoke all on function public.acknowledge_explicit_cart(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_explicit_cart(uuid,uuid) to service_role;
