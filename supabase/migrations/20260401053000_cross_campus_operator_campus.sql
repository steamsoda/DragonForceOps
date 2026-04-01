alter table public.payments
  add column if not exists operator_campus_id uuid null references public.campuses(id) on delete restrict;

update public.payments p
set operator_campus_id = e.campus_id
from public.enrollments e
where e.id = p.enrollment_id
  and p.operator_campus_id is null;

alter table public.payments
  alter column operator_campus_id set not null;

create index if not exists idx_payments_operator_campus_paid_at
  on public.payments (operator_campus_id, paid_at desc)
  where status = 'posted';

create or replace function public.current_user_allowed_campuses()
returns table (campus_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  with role_rows as (
    select ur.campus_id, ar.code
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
  ),
  all_active as (
    select c.id as campus_id
    from public.campuses c
    where c.is_active = true
  )
  select campus_id
  from all_active
  where public.is_director_admin()

  union

  select campus_id
  from all_active
  where exists (
    select 1
    from role_rows rr
    where rr.code = 'front_desk'
      and rr.campus_id is null
  )

  union

  select distinct rr.campus_id
  from role_rows rr
  where rr.code = 'front_desk'
    and rr.campus_id is not null;
$$;

grant execute on function public.current_user_allowed_campuses() to authenticated, anon;

create or replace function public.can_access_campus(p_campus_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.current_user_allowed_campuses() allowed
    where allowed.campus_id = p_campus_id
  );
$$;

grant execute on function public.can_access_campus(uuid) to authenticated, anon;

create or replace function public.list_active_birth_years()
returns table(birth_year int)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct extract(year from p.birth_date)::int as birth_year
  from public.players p
  join public.enrollments e on e.player_id = p.id
  where e.status = 'active'
    and p.status = 'active'
    and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
  order by birth_year desc;
$$;

grant execute on function public.list_active_birth_years() to authenticated;

create or replace function public.list_active_birth_years_by_campus()
returns table (campus_id uuid, birth_year int)
language sql
security definer
stable
set search_path = public
as $$
  select distinct
    e.campus_id,
    extract(year from p.birth_date)::int as birth_year
  from public.enrollments e
  join public.players p on p.id = e.player_id
  where e.status = 'active'
    and p.status = 'active'
    and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
  order by campus_id, birth_year desc;
$$;

grant execute on function public.list_active_birth_years_by_campus() to authenticated;

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
set search_path = public
as $$
  select
    p.id as player_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as player_name,
    extract(year from p.birth_date)::int as birth_year,
    e.id as enrollment_id,
    coalesce(c.name, '-') as campus_name,
    coalesce(b.balance, 0) as balance,
    t.name as team_name,
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

grant execute on function public.search_players_for_caja(text) to authenticated;

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
  team_level    text,
  coach_name    text
)
language sql
security definer
stable
set search_path = public
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
  join public.campuses c on c.id = e.campus_id and c.id = p_campus_id
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
    and extract(year from p.birth_date)::int = p_birth_year
    and public.can_access_campus(p_campus_id)
  order by p.first_name, p.last_name;
$$;

grant execute on function public.list_caja_players_by_campus_year(uuid, int) to authenticated;

create or replace function public.list_pending_enrollments_full(
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
set search_path = public
as $$
  with charge_totals as (
    select
      ch.enrollment_id,
      coalesce(sum(ch.amount) filter (where ch.status <> 'void'), 0) as total_charges,
      min(ch.due_date) filter (
        where ch.status <> 'void'
          and ch.due_date is not null
      ) as earliest_due_date
    from public.charges ch
    group by ch.enrollment_id
  ),
  payment_totals as (
    select
      pay.enrollment_id,
      coalesce(sum(pay.amount) filter (where pay.status = 'posted'), 0) as total_payments
    from public.payments pay
    group by pay.enrollment_id
  ),
  active_balances as (
    select
      e.id as enrollment_id,
      e.player_id,
      e.campus_id,
      e.contactado_at,
      e.contactado_notes,
      coalesce(ct.total_charges, 0) - coalesce(pt.total_payments, 0) as balance,
      ct.earliest_due_date
    from public.enrollments e
    left join charge_totals ct on ct.enrollment_id = e.id
    left join payment_totals pt on pt.enrollment_id = e.id
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
  )
  select
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name as player_first_name,
    p.last_name as player_last_name,
    p.birth_date as birth_date,
    c.name as campus_name,
    c.code as campus_code,
    g.phone_primary,
    ab.balance,
    t.id as team_id,
    t.name as team_name,
    ab.earliest_due_date,
    ab.contactado_at,
    ab.contactado_notes
  from active_balances ab
  join public.players p on p.id = ab.player_id
  join public.campuses c on c.id = ab.campus_id
  left join lateral (
    select g2.phone_primary
    from public.player_guardians pg
    join public.guardians g2 on g2.id = pg.guardian_id
    where pg.player_id = ab.player_id
      and pg.is_primary = true
    limit 1
  ) g on true
  left join lateral (
    select ta.team_id
    from public.team_assignments ta
    where ta.enrollment_id = ab.enrollment_id
      and ta.end_date is null
      and ta.is_primary = true
    limit 1
  ) ta on true
  left join public.teams t on t.id = ta.team_id
  where ab.balance > 0
  order by p.birth_date, p.first_name, p.last_name;
$$;

grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;

create or replace function public.search_receipts(
  p_query text default null,
  p_campus_id uuid default null,
  p_payment_id uuid default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  payment_id uuid,
  folio text,
  paid_at timestamptz,
  player_name text,
  campus_id uuid,
  campus_name text,
  amount numeric,
  method public.payment_method,
  enrollment_id uuid,
  total_count bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_query), '') as q,
      greatest(coalesce(p_limit, 30), 1) as page_limit,
      greatest(coalesce(p_offset, 0), 0) as page_offset
  ),
  base as (
    select
      p.id as payment_id,
      p.folio,
      p.paid_at,
      trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) as player_name,
      c.id as campus_id,
      c.name as campus_name,
      p.amount,
      p.method,
      e.id as enrollment_id
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.players pl on pl.id = e.player_id
    join public.campuses c on c.id = e.campus_id
    cross join params prm
    where p.status = 'posted'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_payment_id is null or p.id = p_payment_id)
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (
        prm.q is null
        or coalesce(p.folio, '') ilike '%' || prm.q || '%'
        or trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) ilike '%' || prm.q || '%'
      )
  ),
  counted as (
    select base.*, count(*) over() as total_count
    from base
  )
  select
    payment_id,
    folio,
    paid_at,
    player_name,
    campus_id,
    campus_name,
    amount,
    method,
    enrollment_id,
    total_count
  from counted
  order by paid_at desc
  limit (select page_limit from params)
  offset (select page_offset from params);
$$;

grant execute on function public.search_receipts(text, uuid, uuid, int, int) to authenticated;
