-- Extend search_players_for_caja to include current team name and coach name.
-- Uses a lateral subquery to get the most recent active team assignment per enrollment.
-- DROP required because CREATE OR REPLACE cannot change a function's return type.

drop function if exists public.search_players_for_caja(text);

create function public.search_players_for_caja(search_query text)
returns table (
  player_id    uuid,
  player_name  text,
  birth_year   int,
  enrollment_id uuid,
  campus_name  text,
  balance      numeric,
  team_name    text,
  coach_name   text
)
language sql
security definer
stable
as $$
  select
    p.id                                                          as player_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as player_name,
    extract(year from p.birth_date)::int                          as birth_year,
    e.id                                                          as enrollment_id,
    coalesce(c.name, '-')                                         as campus_name,
    coalesce(b.balance, 0)                                        as balance,
    t.name                                                        as team_name,
    case
      when co.id is not null
      then trim(coalesce(co.first_name, '') || ' ' || coalesce(co.last_name, ''))
    end                                                           as coach_name
  from public.players p
  join public.enrollments e on e.player_id = p.id and e.status = 'active'
  join public.campuses c on c.id = e.campus_id
  left join public.v_enrollment_balances b on b.enrollment_id = e.id
  left join lateral (
    select ta.team_id
    from public.team_assignments ta
    where ta.enrollment_id = e.id
      and ta.end_date is null
    order by ta.start_date desc
    limit 1
  ) cur_ta on true
  left join public.teams t on t.id = cur_ta.team_id
  left join public.coaches co on co.id = t.coach_id
  where p.status = 'active'
    and (
      p.first_name ilike '%' || search_query || '%'
      or p.last_name ilike '%' || search_query || '%'
    )
  order by p.last_name, p.first_name
  limit 8;
$$;

grant execute on function public.search_players_for_caja(text) to authenticated;
