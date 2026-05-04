-- Clear Supabase security advisor findings for pg_trgm in public and the
-- refund-aware enrollment balance view losing security_invoker.

create schema if not exists extensions;

alter extension pg_trgm set schema extensions;

grant usage on schema extensions to anon, authenticated, service_role;

create or replace view public.v_enrollment_balances
  with (security_invoker = true)
as
with charge_totals as (
  select
    c.enrollment_id,
    coalesce(sum(c.amount) filter (where c.status <> 'void'), 0)::numeric(12,2) as total_charges
  from public.charges c
  group by c.enrollment_id
),
payment_totals as (
  select
    p.enrollment_id,
    (
      coalesce(sum(p.amount) filter (where p.status = 'posted'), 0)
      - coalesce(sum(pr.amount), 0)
    )::numeric(12,2) as total_payments
  from public.payments p
  left join public.payment_refunds pr on pr.payment_id = p.id
  group by p.enrollment_id
)
select
  e.id as enrollment_id,
  coalesce(ct.total_charges, 0)::numeric(12,2) as total_charges,
  coalesce(pt.total_payments, 0)::numeric(12,2) as total_payments,
  (coalesce(ct.total_charges, 0) - coalesce(pt.total_payments, 0))::numeric(12,2) as balance
from public.enrollments e
left join charge_totals ct on ct.enrollment_id = e.id
left join payment_totals pt on pt.enrollment_id = e.id;

drop function if exists public.search_players_for_caja(text);

create function public.search_players_for_caja(search_query text)
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
set search_path = public, extensions
as $$
  select
    p.id as player_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as player_name,
    extract(year from p.birth_date)::int as birth_year,
    e.id as enrollment_id,
    coalesce(c.name, '-') as campus_name,
    coalesce(b.balance, 0) as balance,
    t.name as team_name,
    t.level as team_level,
    case
      when co.id is not null
      then trim(coalesce(co.first_name, '') || ' ' || coalesce(co.last_name, ''))
    end as coach_name
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
    and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (
      (search_query ~ '^\d{4}$'
        and extract(year from p.birth_date)::int = search_query::int)
      or
      (search_query !~ '^\d{4}$' and (
        p.first_name ilike '%' || search_query || '%'
        or p.last_name ilike '%' || search_query || '%'
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

revoke execute on function public.search_players_for_caja(text) from public;
revoke execute on function public.search_players_for_caja(text) from anon;
grant execute on function public.search_players_for_caja(text) to authenticated;
