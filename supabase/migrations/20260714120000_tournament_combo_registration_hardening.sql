-- Tournament registration remains derived from fully paid charges. These rows
-- make every Combo target visible for both operating campuses and backfill the
-- persistent entries used by later roster-management workflows.

with target_products as (
  select id, name
  from public.products
  where name in (
    'Torneo de Leyendas',
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion'
  )
    and is_active = true
),
target_campuses as (
  select id
  from public.campuses
  where code in ('LINDA_VISTA', 'CONTRY')
),
missing_configurations as (
  select
    p.id as product_id,
    p.name,
    c.id as campus_id,
    template.start_date,
    template.end_date,
    template.signup_deadline
  from target_products p
  cross join target_campuses c
  left join lateral (
    select t.start_date, t.end_date, t.signup_deadline
    from public.tournaments t
    where t.product_id = p.id
      and t.is_active = true
    order by t.created_at asc, t.id asc
    limit 1
  ) template on true
  where not exists (
    select 1
    from public.tournaments existing
    where existing.product_id = p.id
      and existing.campus_id = c.id
      and existing.is_active = true
  )
)
insert into public.tournaments (
  name,
  campus_id,
  product_id,
  gender,
  start_date,
  end_date,
  signup_deadline,
  is_active,
  is_mandatory,
  created_by
)
select
  name,
  campus_id,
  product_id,
  'mixed',
  start_date,
  end_date,
  signup_deadline,
  true,
  false,
  null
from missing_configurations;

with allocation_totals as (
  select pa.charge_id, sum(pa.amount)::numeric(12,2) as allocated_amount
  from public.payment_allocations pa
  group by pa.charge_id
),
eligible_entries as (
  select
    t.id as tournament_id,
    c.enrollment_id,
    c.id as charge_id,
    c.created_at,
    row_number() over (
      partition by t.id, c.enrollment_id
      order by
        case when c.product_id = t.product_id then 0 else 1 end,
        c.created_at asc,
        c.id asc
    ) as row_rank
  from public.tournaments t
  join public.products tournament_product
    on tournament_product.id = t.product_id
   and tournament_product.name in (
     'Torneo de Leyendas',
     'Superliga Regia 17 Edicion',
     'Rosa Power Cup 13 Edicion'
   )
  join public.enrollments e
    on e.campus_id = t.campus_id
  join public.players p
    on p.id = e.player_id
  join public.charges c
    on c.enrollment_id = e.id
   and c.status <> 'void'
   and c.amount > 0
  join allocation_totals paid
    on paid.charge_id = c.id
   and paid.allocated_amount + 0.009 >= c.amount
  where t.is_active = true
    and t.product_id is not null
    and (
      c.product_id = t.product_id
      or exists (
        select 1
        from public.product_bundle_entitlements entitlement
        where entitlement.source_product_id = c.product_id
          and entitlement.target_product_id = t.product_id
          and entitlement.is_active = true
          and (
            entitlement.gender is null
            or entitlement.gender = lower(coalesce(p.gender, ''))
          )
      )
    )
)
insert into public.tournament_player_entries (
  tournament_id,
  enrollment_id,
  charge_id,
  entry_status,
  signed_up_at,
  updated_at
)
select
  tournament_id,
  enrollment_id,
  charge_id,
  'confirmed',
  created_at,
  now()
from eligible_entries
where row_rank = 1
on conflict (tournament_id, enrollment_id) do update
set
  charge_id = excluded.charge_id,
  entry_status = 'confirmed',
  signed_up_at = excluded.signed_up_at,
  updated_at = excluded.updated_at;
