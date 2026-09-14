-- Private, explicitly approved identities; no public sign-up grants.
create table public.porto_viewer_authorizations (
 email text primary key check (email=lower(btrim(email))),
 enabled boolean not null default true,
 auto_grant boolean not null default false,
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 reason text not null
);
alter table public.porto_viewer_authorizations enable row level security;
revoke all on public.porto_viewer_authorizations from public,anon,authenticated;
grant select,insert,update,delete on public.porto_viewer_authorizations to service_role;
insert into public.porto_viewer_authorizations(email,auto_grant,reason,approved_by)
select v.email,v.auto_grant,v.reason,u.id from (values
 ('rita.cabral@fcporto.pt',false,'Preserve existing manual authorization; no automatic grant approved in this pass.'),
 ('tigres.azulyoro@live.com',true,'Owner requested preauthorized non-financial read-only test access on 2026-09-13.')
) as v(email,auto_grant,reason) cross join auth.users u where lower(u.email)='javierg@dragonforcemty.com';
do $$ begin
 if (select count(*) from public.porto_viewer_authorizations)<>2 then raise exception 'Preauthorization owner identity missing'; end if;
end $$;

-- Preserve the existing guards/projection, replacing only the single-email check.
do $$ declare d text; signature text; needle text := 'lower(email)=''rita.cabral@fcporto.pt'''; begin
 foreach signature in array array[
  'public.validate_porto_role_assignment()',
  'public.porto_operational_overview(text,uuid,text,date,date,integer)'
 ] loop
  d:=pg_get_functiondef(signature::regprocedure);
  if position(needle in d)=0 then raise exception 'Unexpected Porto allowlist definition: %',signature; end if;
  d:=replace(d,needle,'lower(email) in (select a.email from public.porto_viewer_authorizations a where a.enabled)');
  execute d;
 end loop;
end $$;

create function public.claim_preauthorized_porto_viewer() returns trigger
language plpgsql security definer set search_path=public as $$
declare approval public.porto_viewer_authorizations%rowtype; viewer_role uuid;
begin
 if new.email_confirmed_at is null or new.email is null then return new; end if;
 select * into approval from public.porto_viewer_authorizations
 where email=lower(new.email) and enabled and auto_grant and claimed_at is null for update;
 if not found then return new; end if;
 -- Never change an existing staff account's authority or combine roles.
 if exists(select 1 from public.user_roles where user_id=new.id) then return new; end if;
 select id into strict viewer_role from public.app_roles where code='porto_viewer';
 insert into public.user_roles(user_id,role_id,campus_id) values(new.id,viewer_role,null);
 update public.porto_viewer_authorizations set claimed_by=new.id,claimed_at=now() where email=approval.email;
 insert into public.audit_logs(actor_user_id,actor_email,action,table_name,record_id,after_data,request_id)
 values(approval.approved_by,(select email from auth.users where id=approval.approved_by),'user.porto_viewer.preapproval_claimed','user_roles',new.id,
  jsonb_build_object('email',lower(new.email),'role','porto_viewer','financialAccess',false,'writeAccess',false,'approvalReason',approval.reason),
  'porto.preapproval.'||new.id::text);
 return new;
end $$;
revoke all on function public.claim_preauthorized_porto_viewer() from public,anon,authenticated;
create trigger claim_preauthorized_porto_viewer
 after insert or update of email,email_confirmed_at,last_sign_in_at on auth.users
 for each row execute function public.claim_preauthorized_porto_viewer();
