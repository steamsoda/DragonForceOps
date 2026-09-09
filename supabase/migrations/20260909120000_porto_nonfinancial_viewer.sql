-- External review is separate from staff permissions and raw business tables.
insert into public.app_roles(code,name) values ('porto_viewer','Porto - Solo lectura, sin finanzas')
on conflict(code) do nothing;

create or replace function public.is_porto_viewer() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from user_roles ur join app_roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and r.code='porto_viewer');
$$;
create or replace function public.has_internal_staff_role() returns boolean
language sql stable security definer set search_path=public as $$
 select not public.is_porto_viewer() and exists(select 1 from user_roles ur join app_roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and r.code in ('superadmin','director_admin','director_deportivo','nutritionist','attendance_admin','admin_oficina','front_desk','coach'));
$$;
revoke all on function public.is_porto_viewer(),public.has_internal_staff_role() from public,anon;
grant execute on function public.is_porto_viewer(),public.has_internal_staff_role() to authenticated,service_role;

create or replace function public.validate_porto_role_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_code text;
begin
 perform 1 from auth.users where id=new.user_id for update;
 select code into strict v_code from app_roles where id=new.role_id;
 if v_code='porto_viewer' then
  if new.campus_id is not null or not exists(select 1 from auth.users where id=new.user_id and lower(email)='rita.cabral@fcporto.pt' and email_confirmed_at is not null) then
   raise exception 'porto_requires_verified_allowlisted_account' using errcode='42501';
  end if;
  if exists(select 1 from user_roles where user_id=new.user_id and role_id<>new.role_id) then
   raise exception 'porto_cannot_combine_staff_roles' using errcode='42501';
  end if;
 elsif exists(select 1 from user_roles ur join app_roles r on r.id=ur.role_id where ur.user_id=new.user_id and r.code='porto_viewer') then
  raise exception 'remove_porto_role_before_granting_staff_access' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.validate_porto_role_assignment() from public,anon,authenticated;
drop trigger if exists validate_porto_role_assignment on public.user_roles;
create trigger validate_porto_role_assignment before insert or update on public.user_roles
for each row execute function public.validate_porto_role_assignment();

-- Existing authenticated-wide reads must require an actual staff role.
alter policy coaches_select_authenticated on public.coaches using ((select public.has_internal_staff_role()));
alter policy events_select_authenticated on public.academy_events using ((select public.has_internal_staff_role()));
alter policy area_map_select_authenticated on public.area_map_entries using ((select public.has_internal_staff_role()));
alter policy authenticated_read_who_growth_reference on public.who_growth_reference using ((select public.has_internal_staff_role()));

-- Restrictive policies cannot be overridden by another permissive table policy.
-- Role metadata remains readable for the user's authentication bootstrap only.
do $$ declare t record; op text; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
  if t.relname not in ('app_roles','user_roles') then
   execute format('create policy porto_no_raw_access on public.%I as restrictive for all to authenticated using ((select not public.is_porto_viewer())) with check ((select not public.is_porto_viewer()))',t.relname);
  else
   foreach op in array array['insert','update','delete'] loop
    execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
     'porto_no_'||op,t.relname,op,
     case when op='insert' then 'with check ((select not public.is_porto_viewer()))'
          when op='delete' then 'using ((select not public.is_porto_viewer()))'
          else 'using ((select not public.is_porto_viewer())) with check ((select not public.is_porto_viewer()))' end);
   end loop;
  end if;
 end loop;
end $$;

-- Preserve the existing report body, adding the missing check before any reads.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.get_porto_datos_generales(date)'::regprocedure);
 if position(E'begin\n  v_first_day' in d)=0 then raise exception 'Unexpected Porto report definition'; end if;
 d:=replace(d,E'begin\n  v_first_day',E'begin\n  if not public.is_director_admin() or public.is_porto_viewer() then\n    raise exception ''finance_role_required'' using errcode=''42501'';\n  end if;\n  v_first_day');
 execute d;
end $$;
revoke all on function public.get_porto_datos_generales(date) from public,anon;
grant execute on function public.get_porto_datos_generales(date) to authenticated,service_role;

do $$ declare d text; begin
 d:=pg_get_functiondef('public.get_latest_finance_reconciliation_snapshot(uuid)'::regprocedure);
 if position(E'where (\n    p_campus_id' in d)=0 then raise exception 'Unexpected finance snapshot definition'; end if;
 d:=replace(d,E'where (\n    p_campus_id',E'where public.is_director_admin() and not public.is_porto_viewer() and ((\n    p_campus_id');
 d:=replace(d,'or s.campus_id = p_campus_id','or s.campus_id = p_campus_id)');
 execute d;
end $$;
revoke all on function public.get_latest_finance_reconciliation_snapshot(uuid) from public,anon;
grant execute on function public.get_latest_finance_reconciliation_snapshot(uuid) to authenticated,service_role;

create or replace function public.list_teams_with_counts()
returns table(team_id uuid,player_count integer,new_arrival_count integer)
language sql stable security definer set search_path=public as $$
 select ta.team_id,count(*)::int,sum(case when ta.is_new_arrival then 1 else 0 end)::int
 from team_assignments ta join enrollments e on e.id=ta.enrollment_id and e.status='active'
 where ta.end_date is null and public.has_internal_staff_role() and public.current_user_can_access_team(ta.team_id)
 group by ta.team_id;
$$;
revoke all on function public.list_teams_with_counts() from public,anon;
grant execute on function public.list_teams_with_counts() to authenticated,service_role;

-- A fixed projection: never return enrollment pricing, payment state, scholarships,
-- charge totals, internal notes, product records or source JSON blobs.
create or replace function public.porto_operational_overview(
 p_view text default 'players',p_campus uuid default null,p_search text default '',
 p_from date default current_date-30,p_to date default current_date,p_page integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.is_porto_viewer() or not exists(select 1 from auth.users where id=auth.uid()
  and lower(email)='rita.cabral@fcporto.pt' and email_confirmed_at is not null) then
  raise exception 'porto_viewer_required' using errcode='42501';
 end if;
 if p_view not in ('players','guardians','groups','attendance','squads','schedules','registrations','trials')
 or p_page is null or p_page<0 or p_page>1000 or p_from is null or p_to is null
 or p_from>p_to or p_to-p_from>366 or length(coalesce(p_search,''))>100 then
  raise exception 'invalid_porto_filter' using errcode='22023';
 end if;
 with entries as (
  select p.id::text id,e.campus_id,c.name campus,concat_ws(' ',p.first_name,p.last_name) label,
   p.public_player_id detail,extract(year from p.birth_date)::text extra,p.status::text status,null::date event_date
  from players p join enrollments e on e.player_id=p.id and e.status='active' join campuses c on c.id=e.campus_id where p_view='players'
  union all
  select pg.id::text,e.campus_id,c.name,concat_ws(' ',g.first_name,g.last_name),concat_ws(' ',p.first_name,p.last_name),
   concat_ws(' | ',g.phone_primary,g.email),g.relationship_label,null::date
  from guardians g join player_guardians pg on pg.guardian_id=g.id join players p on p.id=pg.player_id
  join enrollments e on e.player_id=p.id and e.status='active' join campuses c on c.id=e.campus_id where p_view='guardians'
  union all
  select tg.id::text,tg.campus_id,c.name,tg.name,tg.program,
   (select string_agg(concat_ws(' ',co.first_name,co.last_name),', ' order by co.first_name) from training_group_coaches gc join coaches co on co.id=gc.coach_id where gc.training_group_id=tg.id),tg.status,null::date
  from training_groups tg join campuses c on c.id=tg.campus_id where p_view='groups'
  union all
  select ar.id::text,s.campus_id,c.name,concat_ws(' ',p.first_name,p.last_name),tg.name,s.start_time::text,ar.status,s.session_date
  from attendance_records ar join attendance_sessions s on s.id=ar.session_id join players p on p.id=ar.player_id
  join campuses c on c.id=s.campus_id left join training_groups tg on tg.id=s.training_group_id
  where p_view='attendance' and s.session_date between p_from and p_to
  union all
  select sm.id::text,t.campus_id,c.name,s.name,concat_ws(' ',p.first_name,p.last_name),t.name,s.status,null::date
  from competition_roster_squad_members sm join competition_roster_squads s on s.id=sm.squad_id
  join tournaments t on t.id=s.tournament_id join campuses c on c.id=t.campus_id
  join enrollments e on e.id=sm.enrollment_id join players p on p.id=e.player_id
  where p_view='squads' and t.is_active and (t.end_date is null or t.end_date>=current_date)
  union all
  select r.id::text,t.campus_id,c.name,coalesce(s.name,tg.name),t.name,
   concat_ws(' | ',g.arrival_time::text,g.venue,g.opponent),case when r.is_rest then 'Descansa' else 'Reportado' end,coalesce(g.match_date,r.week_start)
  from coach_weekly_schedule_reports r join tournaments t on t.id=r.tournament_id join campuses c on c.id=t.campus_id
  left join competition_roster_squads s on s.id=r.competition_roster_squad_id left join training_groups tg on tg.id=r.training_group_id
  left join coach_weekly_schedule_games g on g.report_id=r.id
  where p_view='schedules' and coalesce(g.match_date,r.week_start) between p_from and p_to
  union all
  select e.id::text,e.campus_id,c.name,concat_ws(' ',p.first_name,p.last_name),p.public_player_id,
   case when e.is_returning then 'Reingreso' else 'Nueva inscripcion' end,e.status::text,e.start_date
  from enrollments e join players p on p.id=e.player_id join campuses c on c.id=e.campus_id
  where p_view='registrations' and e.start_date between p_from and p_to
  union all
  select tp.id::text,tp.campus_id,c.name,concat_ws(' ',tp.first_name,tp.last_name),tg.name,
   concat_ws(' | ',tp.guardian_name,tp.guardian_phone),tp.status,(tp.created_at at time zone 'America/Monterrey')::date
  from trial_prospects tp join campuses c on c.id=tp.campus_id left join training_groups tg on tg.id=tp.preferred_training_group_id
  where p_view='trials' and (tp.created_at at time zone 'America/Monterrey')::date between p_from and p_to
 ), filtered as (
  select * from entries where (p_campus is null or campus_id=p_campus)
  and (coalesce(p_search,'')='' or strpos(lower(concat_ws(' ',label,detail,extra)),lower(p_search))>0)
 ), page as (select * from filtered order by event_date desc nulls last,label,detail,id limit 100 offset p_page*100)
 select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,
  'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
  'campuses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from campuses where is_active)) into result;
 return result;
end $$;
revoke all on function public.porto_operational_overview(text,uuid,text,date,date,integer) from public,anon;
grant execute on function public.porto_operational_overview(text,uuid,text,date,date,integer) to authenticated,service_role;
