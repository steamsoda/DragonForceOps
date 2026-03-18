-- Single-query player search for Caja POS
-- Replaces 3 sequential queries with 1 roundtrip to Supabase
-- Returns active players matching name query with their active enrollment + balance

create or replace function public.search_players_for_caja(search_query text)
returns table (
  player_id   uuid,
  player_name text,
  birth_year  int,
  enrollment_id uuid,
  campus_name text,
  balance     numeric
)
language sql
security definer
stable
as $$
  select
    p.id                                                    as player_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as player_name,
    extract(year from p.birth_date)::int                    as birth_year,
    e.id                                                    as enrollment_id,
    coalesce(c.name, '-')                                   as campus_name,
    coalesce(b.balance, 0)                                  as balance
  from public.players p
  join public.enrollments e on e.player_id = p.id and e.status = 'active'
  join public.campuses c on c.id = e.campus_id
  left join public.v_enrollment_balances b on b.enrollment_id = e.id
  where p.status = 'active'
    and (
      p.first_name ilike '%' || search_query || '%'
      or p.last_name ilike '%' || search_query || '%'
    )
  order by p.last_name, p.first_name
  limit 8;
$$;

grant execute on function public.search_players_for_caja(text) to authenticated;
