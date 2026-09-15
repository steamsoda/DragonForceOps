-- Explicit group moves: no YOB restriction, no finance access, campus scoped.
create function public.can_quick_change_group(p_campus uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=auth.uid() and r.code in ('porto_viewer','director_readonly'))
 and exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=auth.uid() and (r.code in ('superadmin','director_admin','admin_oficina')
    or (r.code='director_deportivo' and (ur.campus_id is null or ur.campus_id=p_campus))
    or (r.code in ('attendance_admin','front_desk') and ur.campus_id=p_campus)));
$$;
revoke all on function public.can_quick_change_group(uuid) from public,anon;
grant execute on function public.can_quick_change_group(uuid) to authenticated;

create function public.search_group_change_players(p_search text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from (
 select p.id,concat_ws(' ',p.first_name,p.last_name) name,p.birth_date,c.name campus
 from public.players p join public.enrollments e on e.player_id=p.id
 join public.campuses c on c.id=e.campus_id
 where e.status='active' and p.status='active' and public.can_quick_change_group(e.campus_id)
 and length(trim(p_search)) between 2 and 100
 and strpos(lower(concat_ws(' ',p.first_name,p.last_name,p.public_player_id)),lower(trim(p_search)))>0
 order by p.first_name,p.last_name,p.id limit 30) rows;
$$;
revoke all on function public.search_group_change_players(text) from public,anon;
grant execute on function public.search_group_change_players(text) to authenticated;

create function public.get_group_change_options(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.enrollments e join public.players p on p.id=e.player_id
   where e.player_id=p_player and e.status='active' and p.status='active' and public.can_quick_change_group(e.campus_id)) then
   raise exception 'group_change_forbidden' using errcode='42501';
 end if;
 select jsonb_build_object('player',jsonb_build_object('id',p.id,'name',concat_ws(' ',p.first_name,p.last_name),'birth_date',p.birth_date),
 'enrollments',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'campus_id',e.campus_id,'campus',c.name,
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'group_id',a.training_group_id,'name',g.name)), '[]'::jsonb)
    from public.training_group_assignments a join public.training_groups g on g.id=a.training_group_id
    where a.enrollment_id=e.id and a.end_date is null))), '[]'::jsonb)
   from public.enrollments e join public.campuses c on c.id=e.campus_id
   where e.player_id=p.id and e.status='active' and public.can_quick_change_group(e.campus_id)),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'program',g.program,'gender',g.gender,
   'campus_id',g.campus_id,'campus',c.name,'birth_year_min',g.birth_year_min,'birth_year_max',g.birth_year_max,
   'start_time',g.start_time,'end_time',g.end_time,
   'professor',(select string_agg(concat_ws(' ',co.first_name,co.last_name),', ' order by gc.is_primary desc,co.first_name)
     from public.training_group_coaches gc join public.coaches co on co.id=gc.coach_id where gc.training_group_id=g.id),
   'schedule',(select coalesce(jsonb_agg(jsonb_build_object('day',s.day_of_week,'start',s.start_time,'end',s.end_time) order by s.day_of_week), '[]'::jsonb)
     from public.attendance_schedule_templates s where s.training_group_id=g.id and s.is_active
     and s.effective_start<=(now() at time zone 'America/Monterrey')::date
     and (s.effective_end is null or s.effective_end>=(now() at time zone 'America/Monterrey')::date)))),'[]'::jsonb)
   from public.training_groups g join public.campuses c on c.id=g.campus_id
   where g.status='active' and c.is_active and public.can_quick_change_group(g.campus_id))) into result
 from public.players p where p.id=p_player;
 return result;
end $$;
revoke all on function public.get_group_change_options(uuid) from public,anon;
grant execute on function public.get_group_change_options(uuid) to authenticated;

create function public.quick_change_training_group(p_enrollment uuid,p_assignment uuid,p_target uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments; a public.training_group_assignments; g public.training_groups;
 today date := (now() at time zone 'America/Monterrey')::date; new_id uuid;
begin
 select * into e from public.enrollments where id=p_enrollment for update;
 if not found or e.status<>'active' or not public.can_quick_change_group(e.campus_id)
   or not exists(select 1 from public.players where id=e.player_id and status='active') then
   raise exception 'group_change_forbidden' using errcode='42501';
 end if;
 select * into g from public.training_groups where id=p_target for share;
 if not found or g.status<>'active' or g.campus_id<>e.campus_id then raise exception 'invalid_destination'; end if;
 select * into a from public.training_group_assignments where enrollment_id=e.id and end_date is null for update;
 if a.id is distinct from p_assignment then raise exception 'assignment_changed'; end if;
 if a.training_group_id=g.id then return a.id; end if;
 if e.start_date>today or a.start_date>today then raise exception 'future_assignment'; end if;
 if a.id is not null then
   update public.training_group_assignments set end_date=greatest(start_date,today-1),updated_at=now() where id=a.id;
 end if;
 -- Reopening a same-day assignment avoids violating the historical unique key.
 insert into public.training_group_assignments(training_group_id,enrollment_id,player_id,start_date,assigned_by)
 values(g.id,e.id,e.player_id,today,auth.uid())
 on conflict (enrollment_id,training_group_id,start_date) do update
 set end_date=null,assigned_by=excluded.assigned_by,updated_at=now()
 returning id into new_id;
 insert into public.audit_logs(actor_user_id,action,table_name,record_id,before_data,after_data)
 values(auth.uid(),'training_group.quick_changed','training_group_assignments',new_id,
   jsonb_build_object('assignment_id',a.id,'training_group_id',a.training_group_id),
   jsonb_build_object('enrollment_id',e.id,'training_group_id',g.id,'effective_date',today,'preserve_manual_teams',true));
 return new_id;
end $$;
revoke all on function public.quick_change_training_group(uuid,uuid,uuid) from public,anon;
grant execute on function public.quick_change_training_group(uuid,uuid,uuid) to authenticated;

-- Keep explicit team choices when the current assignment came from this workflow.
-- Automatic rosters still use the existing reconciliation implementation.
alter function public.reconcile_competition_roster_entry(uuid,uuid) rename to reconcile_competition_roster_entry_before_quick_change;
revoke all on function public.reconcile_competition_roster_entry_before_quick_change(uuid,uuid) from public,anon,authenticated;
create function public.reconcile_competition_roster_entry(p_tournament_id uuid,p_enrollment_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];
begin
 select array_agg(m.squad_id) into ids from public.competition_roster_squad_members m
 join public.competition_roster_squads s on s.id=m.squad_id
 where s.tournament_id=p_tournament_id and s.status<>'archived' and m.enrollment_id=p_enrollment_id;
 if cardinality(ids)>0
 and exists(select 1 from public.enrollments where id=p_enrollment_id and status='active')
 and exists(select 1 from public.tournament_player_entries where tournament_id=p_tournament_id and enrollment_id=p_enrollment_id and entry_status='confirmed')
 and exists(select 1 from public.tournaments where id=p_tournament_id and is_active and (end_date is null or end_date>=(now() at time zone 'America/Monterrey')::date))
 and exists(select 1 from public.training_group_assignments a
   join public.audit_logs l on l.record_id=a.id and l.action='training_group.quick_changed'
   where a.enrollment_id=p_enrollment_id and a.end_date is null)
 and exists(select 1 from public.competition_roster_events ev where ev.tournament_id=p_tournament_id
   and ev.enrollment_id=p_enrollment_id and ev.squad_id=any(ids) and ev.event_type in ('squad.member_moved','member.invited_assigned')) then
   return jsonb_build_object('status','manual_assignment_preserved','squad_ids',ids);
 end if;
 return public.reconcile_competition_roster_entry_before_quick_change(p_tournament_id,p_enrollment_id);
end $$;
revoke all on function public.reconcile_competition_roster_entry(uuid,uuid) from public,anon,authenticated;
