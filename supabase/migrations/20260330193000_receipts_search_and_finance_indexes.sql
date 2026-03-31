create extension if not exists pg_trgm;

create index if not exists idx_payments_posted_paid_at
  on public.payments (paid_at desc)
  where status = 'posted';

create index if not exists idx_charges_enrollment_period_month
  on public.charges (enrollment_id, period_month);

create index if not exists idx_players_full_name_trgm
  on public.players
  using gin ((trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops);

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
      and (p_payment_id is null or p.id = p_payment_id)
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (
        prm.q is null
        or (
          prm.q ~ '^[A-Z_]{2,}-\d{6}-\d+'
          and coalesce(p.folio, '') ilike '%' || prm.q || '%'
        )
        or (
          prm.q !~ '^[A-Z_]{2,}-\d{6}-\d+'
          and trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) ilike '%' || prm.q || '%'
        )
      )
  ),
  counted as (
    select
      base.*,
      count(*) over() as total_count
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
