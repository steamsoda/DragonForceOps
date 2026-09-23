-- INV-PLAN-002A r1. No existing coach or account is changed by installation.
create table public.coach_session_attribution_locks (
 session_id uuid primary key references public.attendance_sessions(id),
 coach_snapshot jsonb, captured_at timestamptz, source text,
 locked_at timestamptz not null default now()
);
alter table public.coach_session_attribution_locks enable row level security;
revoke all on public.coach_session_attribution_locks from public,anon,authenticated;
grant select on public.coach_session_attribution_locks to service_role;

-- Late completion must not relabel a past session after its coach was replaced.
create or replace function public.capture_attendance_session_coach_snapshot() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.coach_session_attribution_locks;
begin
 if new.training_group_id is null then return new; end if;
 if tg_op='UPDATE' and new.training_group_id is not distinct from old.training_group_id then
  select * into saved from public.coach_session_attribution_locks where session_id=new.id;
  if found then
   new.coach_snapshot:=saved.coach_snapshot;
   new.coach_snapshot_captured_at:=saved.captured_at;
   new.coach_snapshot_source:=saved.source;
   return new;
  end if;
 end if;
 if tg_op='INSERT' or new.training_group_id is distinct from old.training_group_id
  or (new.status='completed' and old.status is distinct from 'completed') then
  new.coach_snapshot:=public.current_training_group_coach_snapshot(new.training_group_id);
  new.coach_snapshot_captured_at:=now();
  new.coach_snapshot_source:=case when new.status='completed' then 'completion' else 'creation' end;
 end if;
 return new;
end;
$$;
create table public.invicta_account_blocks (
 user_id uuid primary key references auth.users(id),
 coach_id uuid not null references public.coaches(id),
 blocked_by uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 3 and 500),
 blocked_at timestamptz not null default now(),
 provider_revoked_at timestamptz,
 provider_error boolean not null default false
);
alter table public.invicta_account_blocks enable row level security;
revoke all on public.invicta_account_blocks from public,anon,authenticated;
grant select,update on public.invicta_account_blocks to service_role;

create function public.invicta_account_access_allowed() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.invicta_account_blocks where user_id=auth.uid());
$$;
revoke all on function public.invicta_account_access_allowed() from public,anon;
grant execute on function public.invicta_account_access_allowed() to authenticated,service_role;

create function public.assert_invicta_account_access() returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.invicta_account_access_allowed() then
  raise exception 'invicta_account_blocked' using errcode='42501';
 end if;
end;
$$;
revoke all on function public.assert_invicta_account_access() from public,anon;
grant execute on function public.assert_invicta_account_access() to authenticated,service_role;

-- Protect old access tokens, including owner-rights RPC reads and writes.
-- Follow the existing director-readonly definer-guard migration convention.
do $$ declare f record; definition text; body text; begin
 for f in select p.*,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prosecdef and p.prokind='f'
 and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
 and p.proname not in ('invicta_account_access_allowed','assert_invicta_account_access') loop
  if f.lanname not in ('sql','plpgsql') or f.prosqlbody is not null then
   raise exception 'Review unsupported definer: %',f.oid::regprocedure;
  end if;
  if f.lanname='sql' then body:=E'select public.assert_invicta_account_access();\n'||f.prosrc;
  else body:=E'begin\n perform public.assert_invicta_account_access();\n'||rtrim(f.prosrc,E' \n\r\t;')||E';\nend;'; end if;
  definition:=pg_get_functiondef(f.oid);
  if position(f.prosrc in definition)=0 then raise exception 'Cannot guard %',f.oid::regprocedure; end if;
  execute replace(definition,f.prosrc,body);
  if f.provolatile='i' then execute format('alter function %s stable',f.oid::regprocedure); end if;
 end loop;
end $$;

create function public.invicta_blocked_write_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.assert_invicta_account_access(); return null; end;
$$;
revoke all on function public.invicta_blocked_write_guard() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  if not t.relrowsecurity then raise exception 'Review non-RLS table: %.%',t.nspname,t.relname; end if;
  execute format('create policy invicta_account_not_blocked on %I.%I as restrictive for all to authenticated using ((select public.invicta_account_access_allowed())) with check ((select public.invicta_account_access_allowed()))',t.nspname,t.relname);
  if t.nspname='public' then
   execute format('create trigger invicta_blocked_write before insert or update or delete or truncate on public.%I for each statement execute function public.invicta_blocked_write_guard()',t.relname);
  end if;
 end loop;
end $$;

-- Neither repeated preauthorization nor account linking can restore access.
create function public.prevent_blocked_account_grant() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_table_name='coaches' and tg_op='UPDATE' then
  if not old.is_active and (new.is_active or new.user_id is distinct from old.user_id) then
   raise exception 'coach_reactivation_requires_review' using errcode='42501';
  end if;
 end if;
 if new.user_id is not null then
  perform 1 from auth.users where id=new.user_id for update;
  if exists(select 1 from public.invicta_account_blocks where user_id=new.user_id) then
   if tg_table_name='user_roles' or (tg_op='INSERT') then
    raise exception 'invicta_account_blocked' using errcode='42501';
   elsif new.user_id is distinct from old.user_id or new.is_active then
    raise exception 'invicta_account_blocked' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.prevent_blocked_account_grant() from public,anon,authenticated;
create trigger prevent_blocked_role_grant before insert or update on public.user_roles for each row execute function public.prevent_blocked_account_grant();
create trigger prevent_blocked_coach_link before insert or update on public.coaches for each row execute function public.prevent_blocked_account_grant();

create table public.coach_management_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 coach_id uuid references public.coaches(id), operation text not null,
 before_data jsonb not null, after_data jsonb not null,
 reason text not null, created_at timestamptz not null default now()
);
alter table public.coach_management_events enable row level security;
revoke all on public.coach_management_events from public,anon,authenticated;
grant select on public.coach_management_events to service_role;

create function public.assert_coach_manager(p_actor uuid,p_lifecycle boolean,p_campus uuid default null) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_actor is null or exists(select 1 from public.invicta_account_blocks where user_id=p_actor)
 or not exists(select 1 from auth.users where id=p_actor and (banned_until is null or banned_until<=now()))
 or exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor and r.code in ('director_readonly','porto_viewer'))
 or not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor
  and (r.code='superadmin' or (not p_lifecycle and (r.code='director_admin' or (r.code='director_deportivo' and (ur.campus_id is null or ur.campus_id=p_campus)))))) then
  raise exception 'coach_management_denied' using errcode='42501';
 end if;
end;
$$;
revoke all on function public.assert_coach_manager(uuid,boolean,uuid) from public,anon,authenticated,service_role;

create function public.coach_group_state(p_group uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('coachId',coach_id,'primary',is_primary,'linkId',id) order by coach_id),'[]'::jsonb)
 from public.training_group_coaches where training_group_id=p_group;
$$;
revoke all on function public.coach_group_state(uuid) from public,anon,authenticated,service_role;

-- Review contract includes every source group, so combined teams are not treated
-- as single-group teams. Manual assignments remain independent and unchanged.
create function public.coach_group_tournament_state(p_group uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'tournament',t.name,
  'campusId',t.campus_id,'mode',s.coach_assignment_mode,
  'sourceGroups',(select coalesce(jsonb_agg(jsonb_build_object('groupId',sg.training_group_id,
   'coaches',public.coach_group_state(sg.training_group_id)) order by sg.training_group_id),'[]')
   from public.competition_roster_squad_groups sg where sg.squad_id=s.id)) order by s.id),'[]')
 from public.competition_roster_squads s join public.tournaments t on t.id=s.tournament_id
 where s.status<>'archived' and t.is_active
 and (t.end_date is null or t.end_date>=(now() at time zone 'America/Monterrey')::date)
 and exists(select 1 from public.competition_roster_squad_groups sg where sg.squad_id=s.id and sg.training_group_id=p_group)
 and t.campus_id=(select campus_id from public.training_groups where id=p_group);
$$;
revoke all on function public.coach_group_tournament_state(uuid) from public,anon,authenticated,service_role;

-- Serialize impact-changing writes before row locks, including the existing
-- tournament organizer. A reviewed inherited/manual state cannot race a save.
create function public.lock_coach_tournament_impact() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtext('coach_assignment_changes'));
 return null;
end;
$$;
revoke all on function public.lock_coach_tournament_impact() from public,anon,authenticated;
do $$ declare table_name text; begin
 foreach table_name in array array['training_group_coaches','competition_roster_squads','competition_roster_squad_groups','competition_roster_squad_coaches','tournaments'] loop
  execute format('create trigger coach_tournament_impact_lock before insert or update or delete on public.%I for each statement execute function public.lock_coach_tournament_impact()',table_name);
 end loop;
end $$;

-- Every assignment mutation locks parent groups, including the legacy editor.
create function public.lock_coach_group_assignment() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and new.training_group_id<>old.training_group_id then raise exception 'assignment_group_immutable'; end if;
 if tg_op<>'DELETE' then
  perform 1 from public.coaches where id=new.coach_id and is_active for update;
  if not found then raise exception 'inactive_coach'; end if;
 end if;
 perform 1 from public.training_groups where id=case when tg_op='DELETE' then old.training_group_id else new.training_group_id end for update;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.lock_coach_group_assignment() from public,anon,authenticated;
create trigger lock_coach_group_assignment before insert or update or delete on public.training_group_coaches for each row execute function public.lock_coach_group_assignment();

-- commands: [{groupId, expected: full prior links, coaches: [{coachId,primary}]}]
create function public.manage_coach_groups(p_actor uuid,p_commands jsonb,p_reason text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare command jsonb; group_row public.training_groups; prior jsonb; desired jsonb; coach uuid;
begin
 if jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 100
 or length(trim(p_reason)) not between 3 and 500 then raise exception 'invalid_coach_command'; end if;
 if (select count(*)<>count(distinct x->>'groupId') from jsonb_array_elements(p_commands) x) then raise exception 'duplicate_group'; end if;
 perform pg_advisory_xact_lock(hashtext('coach_assignment_changes'));
 -- Coach-first locks coordinate assignment with departure. Sorted locks avoid inversion.
 for coach in select distinct (x->>'coachId')::uuid from jsonb_array_elements(p_commands) c cross join lateral jsonb_array_elements(c->'coaches') x order by 1 loop
  perform 1 from public.coaches where id=coach and is_active for update;
  if not found then raise exception 'inactive_coach'; end if;
 end loop;
 for command in select x from jsonb_array_elements(p_commands) x order by x->>'groupId' loop
  select * into group_row from public.training_groups where id=(command->>'groupId')::uuid for update;
  if not found then raise exception 'invalid_group'; end if;
  perform public.assert_coach_manager(p_actor,false,group_row.campus_id);
  prior:=public.coach_group_state(group_row.id);
  if prior is distinct from command->'expected' then raise exception 'stale_coach_assignments'; end if;
  desired:=command->'coaches';
  if jsonb_typeof(desired) is distinct from 'array' or jsonb_array_length(desired)>20 then raise exception 'invalid_coaches'; end if;
  if (select count(*)<>count(distinct x->>'coachId') from jsonb_array_elements(desired) x)
   or (jsonb_array_length(desired)>0 and (select count(*) from jsonb_array_elements(desired) x where (x->>'primary')::boolean)<>1)
   or exists(select 1 from jsonb_array_elements(desired) x where x->>'primary' is null or x->>'coachId' is null) then raise exception 'invalid_primary_coach'; end if;
  if group_row.status not in ('active','projected') and exists(select 1 from jsonb_array_elements(desired) x where not exists(select 1 from jsonb_array_elements(prior) y where y->>'coachId'=x->>'coachId')) then raise exception 'inactive_group'; end if;
  if exists(select 1 from public.competition_roster_squad_groups sg join public.competition_roster_squads s on s.id=sg.squad_id join public.tournaments t on t.id=s.tournament_id
   where sg.training_group_id=group_row.id and s.coach_assignment_mode='inherited' and s.status<>'archived' and t.is_active and t.campus_id is distinct from group_row.campus_id) then
   raise exception 'cross_campus_tournament_review';
  end if;
  perform 1 from public.competition_roster_squads s where exists(select 1 from public.competition_roster_squad_groups sg where sg.squad_id=s.id and sg.training_group_id=group_row.id) order by s.id for update;
  if public.coach_group_tournament_state(group_row.id) is distinct from command->'expectedTournaments' then raise exception 'stale_coach_tournaments'; end if;
 end loop;
 -- Validate the complete batch before any change: two selected groups may feed
 -- the same inherited team. Its before/after audit must cover both changes.
 for command in select x from jsonb_array_elements(p_commands) x order by x->>'groupId' loop
  select * into strict group_row from public.training_groups where id=(command->>'groupId')::uuid;
  desired:=command->'coaches';
  insert into public.coach_session_attribution_locks(session_id,coach_snapshot,captured_at,source)
   select s.id,s.coach_snapshot,s.coach_snapshot_captured_at,s.coach_snapshot_source
   from public.attendance_sessions s where s.training_group_id=group_row.id
    and s.session_date+s.start_time <= (now() at time zone 'America/Monterrey')
   on conflict(session_id) do nothing;
  delete from public.training_group_coaches where training_group_id=group_row.id;
  insert into public.training_group_coaches(training_group_id,coach_id,is_primary)
   select group_row.id,(x->>'coachId')::uuid,(x->>'primary')::boolean from jsonb_array_elements(desired) x;
 end loop;
 for command in select x from jsonb_array_elements(p_commands) x loop
  insert into public.coach_management_events(actor_id,operation,before_data,after_data,reason)
   values(p_actor,'assignments',jsonb_build_object('groupId',command->'groupId','coaches',command->'expected','tournaments',command->'expectedTournaments'),
    jsonb_build_object('groupId',command->'groupId','coaches',public.coach_group_state((command->>'groupId')::uuid),
     'tournaments',public.coach_group_tournament_state((command->>'groupId')::uuid)),trim(p_reason));
 end loop;
end;
$$;
revoke all on function public.manage_coach_groups(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.manage_coach_groups(uuid,jsonb,text) to service_role;

create function public.save_coach(p_actor uuid,p_id uuid,p_expected text,p_first text,p_last text,p_campus uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior public.coaches; result uuid;
begin
 perform public.assert_coach_manager(p_actor,true);
 if length(trim(p_first)) not between 1 and 100 or length(trim(p_last)) not between 1 and 100
 or p_campus is null or not exists(select 1 from public.campuses where id=p_campus and is_active) then raise exception 'invalid_coach'; end if;
 perform pg_advisory_xact_lock(hashtext('coach_name:'||lower(trim(p_first)||' '||trim(p_last))));
 if exists(select 1 from public.coaches where lower(trim(first_name))=lower(trim(p_first)) and lower(trim(last_name))=lower(trim(p_last)) and id is distinct from p_id) then raise exception 'duplicate_coach_review'; end if;
 if p_id is not null then
  select * into prior from public.coaches where id=p_id for update;
  if not found or md5(to_jsonb(prior)::text) is distinct from p_expected then raise exception 'stale_coach'; end if;
  if not prior.is_active then raise exception 'inactive_coach'; end if;
  update public.coaches set first_name=trim(p_first),last_name=trim(p_last),campus_id=p_campus,updated_at=now() where id=p_id;
  result:=p_id;
 else
  insert into public.coaches(first_name,last_name,campus_id) values(trim(p_first),trim(p_last),p_campus) returning id into result;
 end if;
 insert into public.coach_management_events(actor_id,coach_id,operation,before_data,after_data,reason)
 values(p_actor,result,'save',coalesce(to_jsonb(prior),'{}'::jsonb),jsonb_build_object('firstName',trim(p_first),'lastName',trim(p_last),'campusId',p_campus),'Datos del profesor');
 return result;
end;
$$;
revoke all on function public.save_coach(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_coach(uuid,uuid,text,text,text,uuid) to service_role;

create function public.coach_departure_state(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('coach',to_jsonb(c),'login',(select jsonb_build_object('id',u.id,'email',u.email) from auth.users u where u.id=c.user_id),'roles',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.user_roles r where r.user_id=c.user_id),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',a.training_group_id,'state',public.coach_group_state(a.training_group_id),'tournaments',public.coach_group_tournament_state(a.training_group_id)) order by a.training_group_id) from public.training_group_coaches a where a.coach_id=c.id),'[]'::jsonb),
 'squads',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.competition_roster_squad_coaches a where a.coach_id=c.id),'[]'::jsonb))
 from public.coaches c where c.id=p_id;
$$;
revoke all on function public.coach_departure_state(uuid) from public,anon,authenticated,service_role;

create function public.depart_coach(p_actor uuid,p_id uuid,p_expected text,p_commands jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.coaches; before_state jsonb; linked uuid;
begin
 perform public.assert_coach_manager(p_actor,true);
 if length(trim(p_reason)) not between 3 and 500 then raise exception 'reason_required'; end if;
 perform pg_advisory_xact_lock(hashtext('coach_assignment_changes'));
 -- Serialize all departures/replacements; retain every identity and role row.
 perform pg_advisory_xact_lock(hashtext('coach_departures'));
 select * into c from public.coaches where id=p_id for update;
 if not found then raise exception 'invalid_coach'; end if;
 linked:=c.user_id;
 if linked is not null then
  perform 1 from auth.users where id=linked for update;
  if linked=p_actor or exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=linked and r.code='superadmin')
   or (select count(*) from public.coaches where user_id=linked)<>1 then raise exception 'protected_coach_account'; end if;
 end if;
 if not c.is_active then
  if linked is not null and not exists(select 1 from public.invicta_account_blocks where user_id=linked and coach_id=p_id) then raise exception 'inactive_account_review'; end if;
  return linked;
 end if;
 perform 1 from public.training_groups g where exists(select 1 from public.training_group_coaches a where a.training_group_id=g.id and a.coach_id=p_id) order by g.id for update;
 before_state:=public.coach_departure_state(p_id);
 if md5(before_state::text) is distinct from p_expected then raise exception 'stale_coach'; end if;
 if jsonb_typeof(p_commands) is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_commands) x where not exists(select 1 from public.training_group_coaches a where a.coach_id=p_id and a.training_group_id=(x->>'groupId')::uuid)) then raise exception 'invalid_departure_groups'; end if;
 if exists(select 1 from jsonb_array_elements(p_commands) x cross join lateral jsonb_array_elements(x->'coaches') y where (y->>'coachId')::uuid=p_id) then raise exception 'departing_coach_assignment'; end if;
 if jsonb_array_length(p_commands)>0 then perform public.manage_coach_groups(p_actor,p_commands,p_reason); end if;
 if exists(select 1 from public.training_group_coaches where coach_id=p_id) then raise exception 'resolve_all_training_groups'; end if;
 update public.coaches set is_active=false,updated_at=now() where id=p_id;
 if linked is not null then
  insert into public.invicta_account_blocks(user_id,coach_id,blocked_by,reason) values(linked,p_id,p_actor,trim(p_reason));
 end if;
 insert into public.coach_management_events(actor_id,coach_id,operation,before_data,after_data,reason)
 values(p_actor,p_id,'departure',before_state,jsonb_build_object('accountBlocked',linked,'manualTournamentsUnchanged',true,'inheritedTournamentsFollowGroups',true),trim(p_reason));
 return linked;
end;
$$;
revoke all on function public.depart_coach(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.depart_coach(uuid,uuid,text,jsonb,text) to service_role;

-- Compact service-only read contract: caller identity always checked, no credentials.
create function public.profesor_directory(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare scope uuid[]; lifecycle boolean; reader boolean;
begin
 if p_actor is null or exists(select 1 from public.invicta_account_blocks where user_id=p_actor)
 or not exists(select 1 from auth.users where id=p_actor and (banned_until is null or banned_until<=now())) then raise exception 'coach_management_denied'; end if;
 select exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor and r.code='director_readonly') into reader;
 if reader then
  if exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor and r.code<>'director_readonly')
   or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'coach_management_denied'; end if;
 end if;
 select exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor and r.code='superadmin') and not reader into lifecycle;
 select array_agg(id) into scope from public.campuses c where is_active and (reader or exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor and (r.code in ('superadmin','director_admin') or (r.code='director_deportivo' and (ur.campus_id is null or ur.campus_id=c.id)))));
 if scope is null then raise exception 'coach_management_denied'; end if;
 return jsonb_build_object('canManage',not reader,'canLifecycle',lifecycle,
 'campuses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.campuses where id=any(scope)),
 'coaches',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'firstName',c.first_name,'lastName',c.last_name,'campusId',c.campus_id,'active',c.is_active,'linked',c.user_id is not null,
  'email',case when lifecycle then u.email end,'roles',case when lifecycle then (select coalesce(jsonb_agg(r.code),'[]') from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=c.user_id) else '[]'::jsonb end,
  'protected',c.user_id=p_actor or exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=c.user_id and r.code='superadmin'),
  'version',md5(to_jsonb(c)::text),'departureVersion',case when lifecycle then md5(public.coach_departure_state(c.id)::text) end,
  'providerPending',b.user_id is not null and b.provider_revoked_at is null,
  'tournaments',(select coalesce(jsonb_agg(jsonb_build_object('squad',s.name,'tournament',t.name,'campusId',t.campus_id,'inherited',s.coach_assignment_mode='inherited') order by t.name,s.name),'[]') from public.competition_roster_squads s join public.tournaments t on t.id=s.tournament_id where t.is_active and s.status<>'archived' and (t.end_date is null or t.end_date>=(now() at time zone 'America/Monterrey')::date) and (lifecycle or t.campus_id=any(scope)) and (
   (s.coach_assignment_mode='manual' and exists(select 1 from public.competition_roster_squad_coaches sc where sc.coach_id=c.id and sc.squad_id=s.id)) or
   (s.coach_assignment_mode='inherited' and exists(select 1 from public.competition_roster_squad_groups sg join public.training_group_coaches gc on gc.training_group_id=sg.training_group_id where sg.squad_id=s.id and gc.coach_id=c.id))))
 ) order by c.first_name,c.last_name),'[]') from public.coaches c left join auth.users u on u.id=c.user_id left join public.invicta_account_blocks b on b.user_id=c.user_id where c.campus_id=any(scope) or (lifecycle and c.campus_id is null) or exists(select 1 from public.training_group_coaches a join public.training_groups g on g.id=a.training_group_id where a.coach_id=c.id and g.campus_id=any(scope))),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'program',g.program,'status',g.status,'campusId',g.campus_id,'startTime',g.start_time,'endTime',g.end_time,'coaches',public.coach_group_state(g.id),'tournaments',public.coach_group_tournament_state(g.id)) order by g.start_time,g.name),'[]') from public.training_groups g where g.campus_id=any(scope) and (g.status='active' or exists(select 1 from public.training_group_coaches a where a.training_group_id=g.id))));
end;
$$;
revoke all on function public.profesor_directory(uuid) from public,anon,authenticated;
grant execute on function public.profesor_directory(uuid) to service_role;
notify pgrst,'reload schema';
