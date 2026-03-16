-- Improve player search in Caja:
--   1. Birth-year search: 4-digit input matches birth year exactly
--   2. Fuzzy name search: typo-tolerant via pg_trgm word_similarity in addition to ilike
--   3. Results ranked by similarity score (best match first)

create extension if not exists pg_trgm;

-- Return type is unchanged (same 8 columns as v2), so CREATE OR REPLACE is safe.
create or replace function public.search_players_for_caja(search_query text)
returns table (
  player_id     uuid,
  player_name   text,
  birth_year    int,
  enrollment_id uuid,
  campus_name   text,
  balance       numeric,
  team_name     text,
  coach_name    text
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
      -- 4-digit input: match birth year
      (search_query ~ '^\d{4}$'
        and extract(year from p.birth_date)::int = search_query::int)
      or
      -- Name input: substring match or fuzzy/typo match
      (search_query !~ '^\d{4}$' and (
        p.first_name ilike '%' || search_query || '%'
        or p.last_name  ilike '%' || search_query || '%'
        or word_similarity(search_query, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) > 0.35
      ))
    )
  order by
    -- Year search: alphabetical. Name search: best trigram match first.
    case when search_query !~ '^\d{4}$'
      then word_similarity(search_query, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    end desc nulls last,
    p.last_name,
    p.first_name
  limit 8;
$$;

grant execute on function public.search_players_for_caja(text) to authenticated;
