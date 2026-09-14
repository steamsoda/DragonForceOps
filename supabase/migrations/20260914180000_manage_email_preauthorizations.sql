-- Extend the existing queue; do not change existing approvals or grant any accounts.
alter table public.porto_viewer_authorizations
 add column role_code text not null default 'porto_viewer' references public.app_roles(code),
 add column campus_id uuid references public.campuses(id),
 add column revision integer not null default 0,
 add column last_issue text;

create function public.assert_preauthorization_manager() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   join auth.users u on u.id=ur.user_id where ur.user_id=auth.uid() and r.code='superadmin'
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
   or public.has_director_readonly_role() or public.is_porto_viewer() then
  raise exception 'preauthorization_forbidden' using errcode='42501';
 end if;
end $$;
revoke all on function public.assert_preauthorization_manager() from public,anon,authenticated;

create function public.list_email_preauthorizations(p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.assert_preauthorization_manager();
 if p_offset is null or p_offset<0 or length(coalesce(p_search,''))>254 then raise exception 'invalid_form'; end if;
 select jsonb_build_object('total',(select count(*) from public.porto_viewer_authorizations a
   where strpos(a.email,lower(btrim(coalesce(p_search,''))))>0),
   'items',coalesce(jsonb_agg(to_jsonb(items)),'[]'::jsonb)) into result from (
  select a.email,a.role_code,a.campus_id,c.name campus_name,a.enabled,a.auto_grant,
   a.claimed_at,a.approved_at,a.revision,a.last_issue from public.porto_viewer_authorizations a
   left join public.campuses c on c.id=a.campus_id
   where strpos(a.email,lower(btrim(coalesce(p_search,''))))>0
   order by a.approved_at desc,a.email limit 50 offset p_offset
 ) items;
 return result;
end $$;

create function public.save_email_preauthorization(p_email text,p_role text,p_campus uuid,p_revision integer)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare target text:=lower(btrim(p_email)); previous public.porto_viewer_authorizations%rowtype;
begin
 perform public.assert_preauthorization_manager();
 if target is null or length(target)>254 or target !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or p_role is null or p_role not in ('porto_viewer','director_readonly','superadmin','director_admin',
     'director_deportivo','nutritionist','attendance_admin','admin_oficina','front_desk') then raise exception 'invalid_form'; end if;
 if p_role not in ('porto_viewer','director_readonly') and split_part(target,'@',2)
   not in ('dragonforcemty.com','fcportodragonforcemty.com') then raise exception 'staff_domain_required'; end if;
 if (p_role in ('nutritionist','attendance_admin','front_desk') and p_campus is null)
   or (p_role not in ('nutritionist','attendance_admin','front_desk','director_deportivo') and p_campus is not null)
   or (p_campus is not null and not exists(select 1 from public.campuses where id=p_campus and is_active)) then
  raise exception 'invalid_campus';
 end if;
 -- Serialize edits to the same email; login claims also lock the queue row.
 perform pg_advisory_xact_lock(hashtextextended(target,0));
 select * into previous from public.porto_viewer_authorizations where email=target for update;
 if (found and (p_revision is distinct from previous.revision or previous.claimed_at is not null))
   or (not found and p_revision is distinct from -1) then raise exception 'preauthorization_changed'; end if;
 if exists(select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id where lower(u.email)=target) then
  raise exception 'existing_user_access';
 end if;
 insert into public.porto_viewer_authorizations(email,role_code,campus_id,enabled,auto_grant,approved_by,reason)
 values(target,p_role,p_campus,true,true,auth.uid(),'Superadmin email preauthorization')
 on conflict(email) do update set role_code=excluded.role_code,campus_id=excluded.campus_id,
 enabled=true,auto_grant=true,approved_by=auth.uid(),approved_at=now(),revision=previous.revision+1,last_issue=null;
 insert into public.audit_logs(actor_user_id,action,table_name,before_data,after_data)
 values(auth.uid(),'user.preauthorization.saved','porto_viewer_authorizations',
   case when previous.email is not null then to_jsonb(previous) else null end,
   jsonb_build_object('email',target,'role',p_role,'campus_id',p_campus));
end $$;

create function public.revoke_email_preauthorization(p_email text,p_revision integer) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous public.porto_viewer_authorizations%rowtype;
begin
 perform public.assert_preauthorization_manager();
 select * into previous from public.porto_viewer_authorizations where email=lower(btrim(p_email)) for update;
 if not found or previous.revision is distinct from p_revision or previous.claimed_at is not null then
  raise exception 'preauthorization_changed';
 end if;
 update public.porto_viewer_authorizations set enabled=false,auto_grant=false,revision=revision+1
 where email=previous.email;
 insert into public.audit_logs(actor_user_id,action,table_name,before_data,after_data)
 values(auth.uid(),'user.preauthorization.revoked','porto_viewer_authorizations',to_jsonb(previous),
   jsonb_build_object('email',previous.email,'enabled',false));
end $$;

create or replace function public.claim_preauthorized_porto_viewer() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare approval public.porto_viewer_authorizations%rowtype; target_role uuid; issue text;
begin
 if new.email_confirmed_at is null or new.email is null or (new.banned_until is not null and new.banned_until>now()) then return new; end if;
 select * into approval from public.porto_viewer_authorizations where email=lower(new.email)
   and enabled and auto_grant and claimed_at is null for update;
 if not found then return new; end if;
 if exists(select 1 from public.user_roles where user_id=new.id) then issue:='existing_user_access';
 elsif not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   join auth.users u on u.id=ur.user_id where ur.user_id=approval.approved_by and r.code='superadmin'
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then issue:='approver_inactive';
 elsif approval.campus_id is not null and not exists(select 1 from public.campuses where id=approval.campus_id and is_active) then issue:='campus_inactive';
 elsif approval.role_code not in ('porto_viewer','director_readonly') and split_part(lower(new.email),'@',2)
   not in ('dragonforcemty.com','fcportodragonforcemty.com') then issue:='staff_domain_required';
 end if;
 if issue is not null then
  update public.porto_viewer_authorizations set enabled=false,auto_grant=false,last_issue=issue,revision=revision+1 where email=approval.email;
  insert into public.audit_logs(actor_user_id,action,table_name,after_data)
  values(approval.approved_by,'user.preauthorization.blocked','porto_viewer_authorizations',jsonb_build_object('email',approval.email,'issue',issue));
  return new;
 end if;
 select id into strict target_role from public.app_roles where code=approval.role_code;
 insert into public.user_roles(user_id,role_id,campus_id) values(new.id,target_role,approval.campus_id);
 update public.porto_viewer_authorizations set claimed_by=new.id,claimed_at=now(),revision=revision+1 where email=approval.email;
 insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
 values(approval.approved_by,'user.preauthorization.claimed','user_roles',new.id,
   jsonb_build_object('email',approval.email,'role',approval.role_code,'campus_id',approval.campus_id));
 return new;
end $$;

revoke all on function public.list_email_preauthorizations(text,integer),public.save_email_preauthorization(text,text,uuid,integer),
 public.revoke_email_preauthorization(text,integer) from public,anon;
grant execute on function public.list_email_preauthorizations(text,integer),public.save_email_preauthorization(text,text,uuid,integer),
 public.revoke_email_preauthorization(text,integer) to authenticated;
-- Table stays private; no new direct SELECT or mutation grants to authenticated.
