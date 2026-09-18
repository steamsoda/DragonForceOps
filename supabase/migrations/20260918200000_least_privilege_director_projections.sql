-- Preserve PostgREST filtering while removing postgres-owned data access.
-- Internal views retain owner semantics, but their owner cannot bypass RLS,
-- write data, read financial columns, log in, or be assumed by API roles.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='director_projection_reader') then
  create role director_projection_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if exists(select 1 from pg_roles where rolname='director_projection_reader'
   and (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
  raise exception 'Unsafe director projection role';
 end if;
 if exists(select 1 from pg_auth_members m
   where m.member='director_projection_reader'::regrole
      or (m.roleid='director_projection_reader'::regrole and m.member<>'postgres'::regrole)) then
  raise exception 'Unexpected director projection membership';
 end if;
end $$;
grant director_projection_reader to postgres;
create schema if not exists director_readonly_private authorization postgres;
revoke all on schema director_readonly_private from public,anon,authenticated;
grant usage on schema director_readonly_private to authenticated,director_projection_reader;
grant create on schema director_readonly_private to director_projection_reader;
grant usage on schema public to director_projection_reader;
grant execute on function public.is_director_readonly() to director_projection_reader;

do $$ declare spec record; names text; column_name text; existing text[]; begin
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
 ) contract(table_name,columns) loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||spec.table_name) and relrowsecurity) then
   raise exception 'Projection source requires RLS: %',spec.table_name;
  end if;
  select array_agg(attname::text order by attnum) into existing from pg_attribute
   where attrelid=to_regclass('public.v_director_readonly_'||spec.table_name) and attnum>0 and not attisdropped;
  if existing is distinct from string_to_array(spec.columns,',') then
   raise exception 'Projection contract drift: %',spec.table_name;
  end if;
  select string_agg(format('%I',x),',') into names from unnest(string_to_array(spec.columns,',')) x;
  -- Revoke table and column privileges before granting only the reviewed contract.
  execute format('revoke all on public.%I from director_projection_reader',spec.table_name);
  for column_name in select attname from pg_attribute where attrelid=to_regclass('public.'||spec.table_name) and attnum>0 and not attisdropped loop
   execute format('revoke all (%I) on public.%I from director_projection_reader',column_name,spec.table_name);
  end loop;
  execute format('grant select (%s) on public.%I to director_projection_reader',names,spec.table_name);
  execute format('drop policy if exists director_projection_select on public.%I',spec.table_name);
  execute format('create policy director_projection_select on public.%I for select to director_projection_reader using ((select public.is_director_readonly()))',spec.table_name);
  execute format('drop policy if exists director_projection_verified on public.%I',spec.table_name);
  execute format('create policy director_projection_verified on public.%I as restrictive for select to director_projection_reader using ((select public.is_director_readonly()))',spec.table_name);
  execute format('create or replace view director_readonly_private.%I with (security_barrier=true) as select %s from public.%I where (select public.is_director_readonly()) offset 0',spec.table_name,names,spec.table_name);
  execute format('alter view director_readonly_private.%I owner to director_projection_reader',spec.table_name);
  execute format('revoke all on director_readonly_private.%I from public,anon,authenticated',spec.table_name);
  execute format('grant select on director_readonly_private.%I to authenticated',spec.table_name);
  execute format('create or replace view public.%I with (security_barrier=true,security_invoker=true) as select %s from director_readonly_private.%I offset 0','v_director_readonly_'||spec.table_name,names,spec.table_name);
 end loop;
end $$;
revoke create on schema director_readonly_private from director_projection_reader;
comment on schema director_readonly_private is 'Internal column-restricted RLS projections. Do not expose through PostgREST. Owner cannot log in or bypass RLS.';
notify pgrst,'reload schema';
