-- Individual account discovery only. No changes to staff readers or write permissions.
create function public.director_caja_players(p_search text default null, p_campus uuid default null, p_year integer default null)
returns table(player_id uuid, player_name text, birth_year integer, enrollment_id uuid,
 campus_name text, balance numeric, team_name text, coach_name text)
language plpgsql stable security definer set search_path=pg_catalog,public,extensions as $$
begin
 if not public.is_director_readonly() then raise exception 'reader_required' using errcode='42501'; end if;
 if (p_search is null and (p_campus is null or p_year is null))
 or (p_search is not null and (length(trim(p_search)) < 2 or length(p_search) > 100))
 or (p_year is not null and (p_year < 1900 or p_year > 2100)) then
  raise exception 'invalid_filter' using errcode='22023';
 end if;
 return query
 select p.id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
 extract(year from p.birth_date)::integer, e.id, c.name, coalesce(b.balance,0)::numeric,
 t.name, case when co.id is not null then trim(coalesce(co.first_name,'')||' '||coalesce(co.last_name,'')) end
 from public.players p join public.enrollments e on e.player_id=p.id and e.status='active'
 join public.campuses c on c.id=e.campus_id and c.is_active
 left join public.v_enrollment_balances b on b.enrollment_id=e.id
 left join lateral (select ta.team_id from public.team_assignments ta
  where ta.enrollment_id=e.id and ta.end_date is null order by ta.start_date desc,ta.id limit 1) a on true
 left join public.teams t on t.id=a.team_id left join public.coaches co on co.id=t.coach_id
 where p.status='active' and (p_campus is null or e.campus_id=p_campus)
 and (p_year is null or extract(year from p.birth_date)::integer=p_year)
 and (p_search is null or
  (trim(p_search) ~ '^\d{4}$' and extract(year from p.birth_date)::text=trim(p_search)) or
  (trim(p_search) !~ '^\d{4}$' and (p.first_name ilike '%'||trim(p_search)||'%'
   or p.last_name ilike '%'||trim(p_search)||'%'
   or word_similarity(trim(p_search),coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) > 0.35)))
 order by case when p_search is not null and trim(p_search) !~ '^\d{4}$'
  then word_similarity(trim(p_search),coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) end desc nulls last,
 p.first_name,p.last_name,e.id
 limit case when p_search is null then 1000 else 8 end;
end; $$;

create function public.director_caja_years()
returns table(campus_id uuid,birth_year integer)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_director_readonly() then raise exception 'reader_required' using errcode='42501'; end if;
 return query select distinct e.campus_id,extract(year from p.birth_date)::integer
 from public.enrollments e join public.players p on p.id=e.player_id
 join public.campuses c on c.id=e.campus_id and c.is_active
 where e.status='active' and p.status='active' and p.birth_date is not null
 order by 1,2 desc;
end; $$;
revoke all on function public.director_caja_players(text,uuid,integer),public.director_caja_years() from public,anon,authenticated;
grant execute on function public.director_caja_players(text,uuid,integer),public.director_caja_years() to authenticated;
