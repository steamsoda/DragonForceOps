-- P1 #25/26/27: sort by first name, expose birth_date in pending RPC,
-- expose level in Caja drill-down.

-- ── 1. search_players_for_caja — fix ORDER BY (no return-type change) ─────────

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
      (search_query ~ '^\d{4}$'
        and extract(year from p.birth_date)::int = search_query::int)
      or
      (search_query !~ '^\d{4}$' and (
        p.first_name ilike '%' || search_query || '%'
        or p.last_name  ilike '%' || search_query || '%'
        or word_similarity(search_query, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) > 0.35
      ))
    )
  order by
    case when search_query !~ '^\d{4}$'
      then word_similarity(search_query, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    end desc nulls last,
    p.first_name,
    p.last_name
  limit 8;
$$;

grant execute on function public.search_players_for_caja(text) to authenticated;

-- ── 2. list_caja_players_by_campus_year — add team_level, fix ORDER BY ────────

drop function if exists public.list_caja_players_by_campus_year(uuid, int);

create function public.list_caja_players_by_campus_year(
  p_campus_id uuid,
  p_birth_year int
)
returns table (
  player_id     uuid,
  player_name   text,
  birth_year    int,
  enrollment_id uuid,
  campus_name   text,
  balance       numeric,
  team_name     text,
  team_level    text,
  coach_name    text
)
language sql
security definer
stable
as $$
  select
    p.id                                                                    as player_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))   as player_name,
    extract(year from p.birth_date)::int                                    as birth_year,
    e.id                                                                    as enrollment_id,
    coalesce(c.name, '-')                                                   as campus_name,
    coalesce(b.balance, 0)                                                  as balance,
    t.name                                                                  as team_name,
    t.level                                                                 as team_level,
    case
      when co.id is not null
      then trim(coalesce(co.first_name, '') || ' ' || coalesce(co.last_name, ''))
    end                                                                     as coach_name
  from public.players p
  join public.enrollments e  on e.player_id = p.id and e.status = 'active'
  join public.campuses c     on c.id = e.campus_id and c.id = p_campus_id
  left join public.v_enrollment_balances b on b.enrollment_id = e.id
  left join lateral (
    select ta.team_id
    from public.team_assignments ta
    where ta.enrollment_id = e.id
      and ta.end_date is null
    order by ta.start_date desc
    limit 1
  ) cur_ta on true
  left join public.teams  t  on t.id = cur_ta.team_id
  left join public.coaches co on co.id = t.coach_id
  where p.status = 'active'
    and extract(year from p.birth_date)::int = p_birth_year
  order by p.first_name, p.last_name;
$$;

grant execute on function public.list_caja_players_by_campus_year(uuid, int) to authenticated;

-- ── 3. list_pending_enrollments_full — add birth_date, fix secondary sort ─────

drop function if exists public.list_pending_enrollments_full(uuid);

create function public.list_pending_enrollments_full(
  p_campus_id uuid default null
)
returns table(
  enrollment_id      uuid,
  player_id          uuid,
  campus_id          uuid,
  player_first_name  text,
  player_last_name   text,
  birth_date         date,
  campus_name        text,
  campus_code        text,
  phone_primary      text,
  balance            numeric,
  team_id            uuid,
  team_name          text,
  earliest_due_date  date,
  contactado_at      timestamptz,
  contactado_notes   text
)
language sql stable security definer
as $$
  with charge_totals as (
    select
      ch.enrollment_id,
      coalesce(sum(ch.amount) filter (where ch.status <> 'void'), 0)           as total_charges,
      min(ch.due_date)        filter (where ch.status <> 'void'
                                       and ch.due_date is not null)            as earliest_due_date
    from public.charges ch
    group by ch.enrollment_id
  ),
  payment_totals as (
    select
      pay.enrollment_id,
      coalesce(sum(pay.amount) filter (where pay.status = 'posted'), 0)        as total_payments
    from public.payments pay
    group by pay.enrollment_id
  ),
  active_balances as (
    select
      e.id         as enrollment_id,
      e.player_id,
      e.campus_id,
      e.contactado_at,
      e.contactado_notes,
      coalesce(ct.total_charges,  0) -
      coalesce(pt.total_payments, 0)                                           as balance,
      ct.earliest_due_date
    from public.enrollments e
    left join charge_totals  ct on ct.enrollment_id = e.id
    left join payment_totals pt on pt.enrollment_id = e.id
    where e.status = 'active'
      and (p_campus_id is null or e.campus_id = p_campus_id)
  )
  select
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name          as player_first_name,
    p.last_name           as player_last_name,
    p.birth_date          as birth_date,
    c.name                as campus_name,
    c.code                as campus_code,
    g.phone_primary,
    ab.balance,
    t.id                  as team_id,
    t.name                as team_name,
    ab.earliest_due_date,
    ab.contactado_at,
    ab.contactado_notes
  from active_balances ab
  join public.players  p on p.id = ab.player_id
  join public.campuses c on c.id = ab.campus_id
  left join lateral (
    select g2.phone_primary
    from   public.player_guardians pg
    join   public.guardians g2 on g2.id = pg.guardian_id
    where  pg.player_id  = ab.player_id
      and  pg.is_primary = true
    limit  1
  ) g on true
  left join lateral (
    select ta.team_id
    from   public.team_assignments ta
    where  ta.enrollment_id = ab.enrollment_id
      and  ta.end_date      is null
      and  ta.is_primary    = true
    limit  1
  ) ta on true
  left join public.teams t on t.id = ta.team_id
  where ab.balance > 0
  order by p.birth_date, p.first_name, p.last_name;
$$;

grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;
