-- ── Performance: v_enrollment_balances + team_assignments index ───────────────
--
-- The CTE-based view was an optimization fence: Postgres computed balances
-- for ALL enrollments before applying any IN (...) filter from the caller.
-- Rewriting with correlated subqueries lets the planner push enrollment_id
-- predicates directly into each subquery, using the existing indexes.
--
-- Also adds a partial index for the most common team_assignments lookup pattern:
-- active primary assignment per enrollment.

create or replace view public.v_enrollment_balances
  with (security_invoker = true)
as
select
  e.id as enrollment_id,
  coalesce((
    select sum(c.amount) from public.charges c
    where c.enrollment_id = e.id and c.status <> 'void'
  ), 0)::numeric(12,2) as total_charges,
  coalesce((
    select sum(p.amount) from public.payments p
    where p.enrollment_id = e.id and p.status = 'posted'
  ), 0)::numeric(12,2) as total_payments,
  (
    coalesce((
      select sum(c.amount) from public.charges c
      where c.enrollment_id = e.id and c.status <> 'void'
    ), 0) -
    coalesce((
      select sum(p.amount) from public.payments p
      where p.enrollment_id = e.id and p.status = 'posted'
    ), 0)
  )::numeric(12,2) as balance
from public.enrollments e;

-- Partial index: fast lookup of active primary team assignment per enrollment
create index if not exists idx_team_assignments_primary_active
  on public.team_assignments (enrollment_id)
  where is_primary = true and end_date is null;

-- ── Caja drill-down: distinct birth years per campus ─────────────────────────

create or replace function public.list_active_birth_years_by_campus()
returns table (campus_id uuid, birth_year int)
language sql
security definer
stable
as $$
  select distinct
    e.campus_id,
    extract(year from p.birth_date)::int as birth_year
  from public.enrollments e
  join public.players p on p.id = e.player_id
  where e.status = 'active' and p.status = 'active'
  order by campus_id, birth_year desc;
$$;

grant execute on function public.list_active_birth_years_by_campus() to authenticated;

-- ── Caja drill-down: player list for campus + birth year ──────────────────────

create or replace function public.list_caja_players_by_campus_year(
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
  order by p.last_name, p.first_name;
$$;

grant execute on function public.list_caja_players_by_campus_year(uuid, int) to authenticated;
