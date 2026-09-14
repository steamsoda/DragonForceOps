-- Global operational reader. No user grants, no changes to staff/Porto helpers.
insert into public.app_roles(code,name) values ('director_readonly','Director - Solo lectura sin finanzas')
on conflict(code) do nothing;

-- Raw membership must remain true after email revocation: denial cannot depend on verification.
create function public.has_director_readonly_role() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and r.code='director_readonly');
$$;
create function public.is_director_readonly() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.has_director_readonly_role()
 and exists(select 1 from auth.users where id=auth.uid() and email is not null
   and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=auth.uid() and (r.code<>'director_readonly' or ur.campus_id is not null));
$$;
create function public.director_readonly_raw_access_allowed() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not public.has_director_readonly_role() and exists(
  select 1 from public.user_roles where user_id=auth.uid()
 );
$$;
create function public.director_readonly_can_access_campus(p_campus_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_director_readonly() and
 (p_campus_id is null or exists(select 1 from public.campuses where id=p_campus_id));
$$;
create function public.director_readonly_deny_legacy_rpc() returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if public.has_director_readonly_role() then
  raise exception 'director_readonly_operation_denied' using errcode='42501';
 end if;
 -- Revocation must not reopen legacy definers when reader membership disappears.
 -- Service/database-owner calls with no end-user identity remain unchanged.
 if auth.uid() is not null and not exists(
  select 1 from public.user_roles where user_id=auth.uid()
 ) then
  raise exception 'assigned_role_required' using errcode='42501';
 end if;
end;
$$;
create function public.director_readonly_deny_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.director_readonly_deny_legacy_rpc();
 return null;
end;
$$;
create function public.validate_director_readonly_assignment() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare code text;
begin
 -- Serialize competing grants for the same account, in either insertion order.
 perform 1 from auth.users where id=new.user_id for update;
 select r.code into strict code from public.app_roles r where r.id=new.role_id;
 if code='director_readonly' then
  if new.campus_id is not null then
   raise exception 'director_readonly_requires_global_scope' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=new.user_id
    and email is not null and email_confirmed_at is not null
    and (banned_until is null or banned_until<=now())) then
   raise exception 'director_readonly_requires_verified_account' using errcode='42501';
  end if;
  if exists(select 1 from public.user_roles where user_id=new.user_id and role_id<>new.role_id) then
   raise exception 'director_readonly_cannot_combine_staff_roles' using errcode='42501';
  end if;
 elsif exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=new.user_id and r.code='director_readonly') then
  raise exception 'director_readonly_cannot_combine_staff_roles' using errcode='42501';
 end if;
 return new;
end;
$$;
create trigger validate_director_readonly_assignment before insert or update on public.user_roles
for each row execute function public.validate_director_readonly_assignment();

revoke all on function public.has_director_readonly_role(),public.is_director_readonly(),public.director_readonly_raw_access_allowed(),
 public.director_readonly_can_access_campus(uuid),public.director_readonly_deny_legacy_rpc(),
 public.director_readonly_deny_write(),public.validate_director_readonly_assignment() from public,anon,authenticated;
grant execute on function public.has_director_readonly_role(),public.is_director_readonly(),public.director_readonly_raw_access_allowed(),
 public.director_readonly_can_access_campus(uuid),public.director_readonly_deny_legacy_rpc() to authenticated,service_role;

do $$ declare t record; op text; begin
 for t in select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') loop
  -- Fail closed on schema drift instead of silently leaving a non-RLS table exposed.
  if not t.relrowsecurity then raise exception 'Review non-RLS table before release: %',t.relname; end if;
  execute format('create trigger director_readonly_no_write before insert or update or delete or truncate on public.%I for each statement execute function public.director_readonly_deny_write()',t.relname);
  if t.relname not in ('app_roles','user_roles') then
   execute format('create policy director_readonly_no_raw on public.%I as restrictive for all to authenticated using ((select public.director_readonly_raw_access_allowed())) with check ((select public.director_readonly_raw_access_allowed()))',t.relname);
  else
   foreach op in array array['insert','update','delete'] loop
    execute format('create policy %I on public.%I as restrictive for %s to authenticated %s','director_readonly_no_'||op,t.relname,op,
     case when op='insert' then 'with check ((select not public.has_director_readonly_role()))'
      when op='delete' then 'using ((select not public.has_director_readonly_role()))'
      else 'using ((select not public.has_director_readonly_role())) with check ((select not public.has_director_readonly_role()))' end);
   end loop;
  end if;
 end loop;
end $$;

-- Auth bootstrap: own assignment plus the joined role code, never the staff directory.
create policy director_readonly_bootstrap_self on public.user_roles for select to authenticated
 using (user_id=auth.uid() and (select public.has_director_readonly_role()));
create policy director_readonly_bootstrap_role on public.app_roles for select to authenticated
 using (code='director_readonly' and (select public.has_director_readonly_role()));
create policy director_readonly_self_only on public.user_roles as restrictive for select to authenticated
 using ((select not public.has_director_readonly_role()) or user_id=auth.uid());
create policy director_readonly_role_only on public.app_roles as restrictive for select to authenticated
 using ((select not public.has_director_readonly_role()) or code='director_readonly');

-- Existing view owners can bypass base RLS. Require the already-established invoker convention.
do $$ declare v record; begin
 for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('v','m')
 and has_table_privilege('authenticated',c.oid,'SELECT')
 and (c.relkind='m' or not coalesce(c.reloptions @> array['security_invoker=true'],false)) loop
  raise exception 'Review owner-rights view before release: %',v.relname;
 end loop;
end $$;

-- Guard every legacy definer entry point, including unguarded finance readers.
-- Only existing role/campus predicates and Porto-specific entry points are exempt;
-- they do not authorize this isolated role. Do not expand their role lists.
-- Preserve signature, owner, grants, volatility, configuration and original body.
do $$ declare f record; definition text; body text; begin
 for f in select p.*,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prosecdef and p.prokind='f'
 and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
 and p.proname not in ('has_director_readonly_role','is_director_readonly','director_readonly_raw_access_allowed','director_readonly_can_access_campus','director_readonly_deny_legacy_rpc')
 and p.proname not in (
  'is_porto_viewer','porto_operational_overview','get_porto_datos_generales',
  'is_director_admin','has_internal_staff_role','has_operational_access','is_front_desk',
  'is_director_deportivo','is_nutritionist','is_attendance_admin','is_office_admin','is_coach',
  'current_user_allowed_campuses','can_access_campus','can_access_sports_campus','can_access_nutrition_campus',
  'current_user_can_access_player','current_user_can_access_guardian','current_user_can_access_enrollment',
  'current_user_can_access_team','current_user_can_access_payment','current_user_can_access_charge',
  'current_user_can_access_cash_session','current_user_can_access_nutrition_player','current_user_can_access_nutrition_enrollment',
  'current_user_attendance_read_campuses','current_user_attendance_write_campuses',
  'can_read_attendance_campus','can_write_attendance_campus','can_review_coach_schedules',
  'can_manage_weekly_callup_campus'
 ) loop
  if f.lanname not in ('sql','plpgsql') or f.prosqlbody is not null then
   raise exception 'Review unsupported definer before release: %',f.oid::regprocedure;
  end if;
  if f.lanname='sql' then
   body:=E'select public.director_readonly_deny_legacy_rpc();\n'||f.prosrc;
  else
   -- Outer block executes before original DECLARE initializers and exception handlers.
   body:=E'begin\n perform public.director_readonly_deny_legacy_rpc();\n'||rtrim(f.prosrc,E' \n\r\t;')||E';\nend;';
  end if;
  definition:=pg_get_functiondef(f.oid);
  if position(f.prosrc in definition)=0 then raise exception 'Cannot guard %',f.oid::regprocedure; end if;
  execute replace(definition,f.prosrc,body);
  -- An identity-sensitive guard must never be constant-folded across callers.
  if f.provolatile='i' then execute format('alter function %s stable',f.oid::regprocedure); end if;
 end loop;
end $$;

-- This VALUES list is the entire page-worker column contract. Never SELECT *.
-- Owner-rights is intentional ONLY for these barrier projections. OFFSET 0 makes
-- them non-updatable even if future default privileges accidentally grant DML.
-- Query each view explicitly; assemble relationships by the projected IDs.
do $$ declare spec record; begin
 for spec in select * from (values
 ('campuses','id,code,name,is_active'),
 ('players','id,public_player_id,first_name,last_name,birth_date,gender,status,level,uniform_size,is_goalkeeper,jersey_number'),
 ('guardians','id,first_name,last_name,phone_primary,phone_secondary,email,relationship_label'),
 ('player_guardians','id,player_id,guardian_id,is_primary'),
 ('enrollments','id,player_id,campus_id,status,start_date,end_date,inscription_date,is_returning,created_at'),
 ('teams','id,campus_id,name,birth_year,season_label,is_active,level,gender,coach_id,type'),
 ('team_assignments','id,enrollment_id,team_id,start_date,end_date,is_primary'),
 ('coaches','id,first_name,last_name,campus_id,is_active'),
 ('training_groups','id,campus_id,name,program,level_label,group_code,gender,birth_year_min,birth_year_max,start_time,end_time,status'),
 ('training_group_coaches','id,training_group_id,coach_id,is_primary'),
 ('training_group_assignments','id,training_group_id,enrollment_id,player_id,start_date,end_date'),
 ('attendance_schedule_templates','id,campus_id,team_id,training_group_id,day_of_week,start_time,end_time,effective_start,effective_end,is_active'),
 ('attendance_sessions','id,campus_id,team_id,training_group_id,session_type,status,session_date,start_time,end_time,opponent_name'),
 ('attendance_records','id,session_id,enrollment_id,player_id,status'),
 ('tournaments','id,name,campus_id,start_date,end_date,is_active,signup_deadline,eligible_birth_year_min,eligible_birth_year_max,gender'),
 ('tournament_team_entries','id,tournament_id,team_id'),
 ('tournament_player_entries','id,tournament_id,enrollment_id'),
 ('competition_roster_squads','id,tournament_id,name,status,squad_kind,program,category_label,gender,sort_order,coach_assignment_mode'),
 ('competition_roster_squad_members','id,squad_id,enrollment_id'),
 ('coach_weekly_schedule_reports','id,week_start,training_group_id,tournament_id,coach_id,is_rest,competition_roster_squad_id'),
 ('coach_weekly_schedule_games','id,report_id,match_date,arrival_time,venue,opponent'),
 ('trial_prospects','id,campus_id,preferred_training_group_id,first_name,last_name,birth_date,gender,guardian_name,guardian_phone,status,converted_player_id,converted_enrollment_id,created_at'),
 ('trial_visits','id,prospect_id,campus_id,training_group_id,attendance_session_id,visit_date,visit_number'),
 ('attendance_closures','id,campus_id,starts_on,ends_on,reason_code,title'),
 ('competition_roster_squad_coaches','id,squad_id,coach_id,is_primary'),
 ('competition_roster_squad_groups','squad_id,training_group_id'),
 ('coach_weekly_schedule_game_players','id,game_id,competition_roster_squad_id,enrollment_id,player_id,roster_status'),
 ('weekly_callups','id,campus_id,tournament_id,program,week_start,status'),
 ('weekly_callup_categories','id,weekly_callup_id,training_group_id,category_label,birth_year_min,birth_year_max,sort_order,is_rest,tournament_id,competition_roster_squad_id'),
 ('weekly_callup_games','id,weekly_callup_category_id,match_date,arrival_time,venue,opponent,sort_order,competition_roster_squad_id'),
 ('weekly_callup_players','id,weekly_callup_category_id,enrollment_id,player_id,birth_year,training_group_id,roster_status'),
 ('weekly_callup_game_players','id,weekly_callup_game_id,enrollment_id,player_id,roster_status'),
 ('academy_events','id,title,proposed_date,actual_date,is_done,participant_count,campus_id'),
 ('area_map_entries','id,entry_date,type_code,deadline_days,closure_date,campus_id'),
 ('products','id,name,is_active'),
 ('uniform_orders','id,player_id,enrollment_id,uniform_type,size,status,ordered_at,delivered_at'),
 ('player_measurement_sessions','id,player_id,enrollment_id,campus_id,measured_at,source,weight_kg,height_cm,waist_circumference_cm,created_at,updated_at'),
 ('who_growth_reference','id,indicator,sex,age_months,l,m,s')
 ) as contract(table_name,columns) loop
  execute format('create view public.%I with (security_barrier=true) as select %s from public.%I where (select public.is_director_readonly()) offset 0',
    'v_director_readonly_'||spec.table_name,spec.columns,spec.table_name);
  execute format('revoke all on public.%I from public,anon,authenticated','v_director_readonly_'||spec.table_name);
  execute format('grant select on public.%I to authenticated','v_director_readonly_'||spec.table_name);
 end loop;
end $$;

-- Optional bounded JSON batch adapter. Direct views remain preferable for filters.
create function public.director_readonly_rows(
 p_resource text,p_ids uuid[] default null,p_limit integer default 500,p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; relation regclass; key_column text;
begin
 if not public.is_director_readonly() then
  raise exception 'director_readonly_required' using errcode='42501';
 end if;
 if p_resource is null or p_resource !~ '^[a-z_]+$' or p_limit is null or p_limit<1 or p_limit>1000
  or p_offset is null or p_offset<0 or p_offset>1000000 or cardinality(p_ids)>1000 then
  raise exception 'invalid_director_readonly_filter' using errcode='22023';
 end if;
 relation:=to_regclass('public.v_director_readonly_'||p_resource);
 if relation is null then raise exception 'unsupported_director_readonly_resource' using errcode='22023'; end if;
 key_column:=case when p_resource='competition_roster_squad_groups' then 'squad_id' else 'id' end;
 execute format('select coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) from (select * from %s where ($1 is null or %I=any($1)) order by %I%s limit $2 offset $3) page',
  relation,key_column,key_column,case when p_resource='competition_roster_squad_groups' then ',training_group_id' else '' end)
 into result using p_ids,p_limit,p_offset;
 return result;
end;
$$;
revoke all on function public.director_readonly_rows(text,uuid[],integer,integer) from public,anon,authenticated;
grant execute on function public.director_readonly_rows(text,uuid[],integer,integer) to authenticated;

-- Future tables/views/definer functions must pass the rollback audit again.
-- RLS cannot constrain service-role page clients; app routes must use the user's JWT.

-- Reviewed invoker report bodies supply the existing math under this owner's
-- rights. Their original definitions and ACLs remain untouched. Do not replace
-- these originals with finance-dependent cohorts without re-auditing wrappers.
create function public.director_readonly_training_workload_30d(
 p_campus_id uuid,p_as_of timestamptz default now()
) returns table (
 campus_id uuid,campus_name text,training_group_id uuid,training_group_name text,
 birth_year_min integer,birth_year_max integer,session_id uuid,session_date date,
 start_time time,end_time time,session_status text,coach_snapshot jsonb,coach_snapshot_source text,
 official_attended_count bigint,official_roster_count bigint,tryout_count bigint,total_served_count bigint,
 completed_session_count bigint,unregistered_session_count bigint,official_attendance_average numeric,
 tryout_average numeric,total_served_average numeric
)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_director_readonly() or p_campus_id is null
  or not public.director_readonly_can_access_campus(p_campus_id) then
  raise exception 'director_readonly_campus_denied' using errcode='42501';
 end if;
 if p_as_of is null or not isfinite(p_as_of) then raise exception 'invalid_report_date' using errcode='22023'; end if;
 return query select r.campus_id,r.campus_name,r.training_group_id,r.training_group_name,
  r.birth_year_min,r.birth_year_max,r.session_id,r.session_date,r.start_time,r.end_time,r.session_status,
  (select coalesce(jsonb_agg(jsonb_build_object(
    'coach_id',case when x.value->>'coach_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x.value->>'coach_id' else null end,
    'name',x.value->>'name','is_primary',coalesce(x.value->>'is_primary'='true',false)) order by x.n),'[]'::jsonb)
   from jsonb_array_elements(case when jsonb_typeof(r.coach_snapshot)='array' then r.coach_snapshot else '[]'::jsonb end) with ordinality x(value,n)),
  case when r.coach_snapshot_source in ('creation','completion','legacy_backfill_current_assignment') then r.coach_snapshot_source else null end,
  r.official_attended_count,r.official_roster_count,r.tryout_count,r.total_served_count,
  r.completed_session_count,r.unregistered_session_count,r.official_attendance_average,r.tryout_average,r.total_served_average
 from public.get_training_workload_30d(p_campus_id,p_as_of) r;
end;
$$;

create function public.director_readonly_weekly_attendance_frequency_v1(
 p_campus_id uuid,p_week_count integer default 8,p_as_of timestamptz default now()
) returns table (
 campus_id uuid,campus_name text,training_group_id uuid,training_group_name text,
 birth_year_min integer,birth_year_max integer,week_start date,week_end date,coach_ids text[],coach_names text,
 sessions_offered bigint,player_weeks bigint,bucket_0 bigint,bucket_1 bigint,bucket_2 bigint,bucket_3 bigint,
 bucket_4_plus bigint,attended_session_records bigint,opportunity_records bigint,average_sessions_attended numeric,attendance_rate numeric
)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_director_readonly() or p_campus_id is null
  or not public.director_readonly_can_access_campus(p_campus_id) then
  raise exception 'director_readonly_campus_denied' using errcode='42501';
 end if;
 if p_as_of is null or not isfinite(p_as_of) or p_week_count is null or p_week_count not between 1 and 12 then
  raise exception 'invalid_report_filter' using errcode='22023';
 end if;
 return query select r.campus_id,r.campus_name,r.training_group_id,r.training_group_name,
  r.birth_year_min,r.birth_year_max,r.week_start,r.week_end,
  array(select x.id from unnest(r.coach_ids) with ordinality x(id,n)
   where x.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' order by x.n),
  r.coach_names,r.sessions_offered,r.player_weeks,r.bucket_0,r.bucket_1,r.bucket_2,r.bucket_3,
  r.bucket_4_plus,r.attended_session_records,r.opportunity_records,r.average_sessions_attended,r.attendance_rate
 from public.get_weekly_attendance_frequency_v1(p_campus_id,p_week_count,p_as_of) r;
end;
$$;
revoke all on function public.director_readonly_training_workload_30d(uuid,timestamptz),
 public.director_readonly_weekly_attendance_frequency_v1(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.director_readonly_training_workload_30d(uuid,timestamptz),
 public.director_readonly_weekly_attendance_frequency_v1(uuid,integer,timestamptz) to authenticated;
