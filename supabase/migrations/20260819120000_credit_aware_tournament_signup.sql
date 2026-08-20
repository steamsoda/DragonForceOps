-- Tournament registration must recognize both direct payment allocations and
-- explicit account-credit applications. A charge funded by both is fully paid.

create or replace function public.sync_paid_tournament_entries_for_charges(
  p_enrollment_id uuid,
  p_charge_ids uuid[]
)
returns table(tournament_id uuid)
language sql
security definer
set search_path = public
as $$
  with payment_totals as (
    select
      allocation.charge_id,
      sum(allocation.amount)::numeric(12, 2) as amount
    from public.payment_allocations allocation
    where allocation.charge_id = any(coalesce(p_charge_ids, array[]::uuid[]))
    group by allocation.charge_id
  ),
  credit_totals as (
    select
      application.charge_id,
      sum(application.amount)::numeric(12, 2) as amount
    from public.enrollment_credit_applications application
    where application.charge_id = any(coalesce(p_charge_ids, array[]::uuid[]))
    group by application.charge_id
  ),
  funded_charges as (
    select
      charge_id,
      sum(amount)::numeric(12, 2) as funded_amount
    from (
      select payment_totals.charge_id, payment_totals.amount from payment_totals
      union all
      select credit_totals.charge_id, credit_totals.amount from credit_totals
    ) funding
    group by charge_id
  ),
  eligible_entries as (
    select
      tournament.id as tournament_id,
      charge.id as charge_id,
      row_number() over (
        partition by tournament.id
        order by
          case when charge.product_id = tournament.product_id then 0 else 1 end,
          charge.created_at,
          charge.id
      ) as row_rank
    from public.charges charge
    join public.enrollments enrollment
      on enrollment.id = charge.enrollment_id
     and enrollment.id = p_enrollment_id
    join public.players player
      on player.id = enrollment.player_id
    join funded_charges paid
      on paid.charge_id = charge.id
     and paid.funded_amount + 0.009 >= charge.amount
    join public.tournaments tournament
      on tournament.campus_id = enrollment.campus_id
     and tournament.is_active = true
     and tournament.product_id is not null
     and (
       tournament.product_id = charge.product_id
       or exists (
         select 1
         from public.product_bundle_entitlements entitlement
         where entitlement.source_product_id = charge.product_id
           and entitlement.target_product_id = tournament.product_id
           and entitlement.is_active = true
           and (
             entitlement.gender is null
             or entitlement.gender = lower(coalesce(player.gender, ''))
           )
       )
     )
    where charge.id = any(coalesce(p_charge_ids, array[]::uuid[]))
      and charge.enrollment_id = p_enrollment_id
      and charge.product_id is not null
      and charge.status <> 'void'
      and charge.amount > 0
  ),
  inserted_entries as (
    insert into public.tournament_player_entries as existing_entry (
      tournament_id,
      enrollment_id,
      charge_id,
      entry_status,
      signed_up_at,
      updated_at
    )
    select
      eligible.tournament_id,
      p_enrollment_id,
      eligible.charge_id,
      'confirmed',
      now(),
      now()
    from eligible_entries eligible
    where eligible.row_rank = 1
    on conflict (tournament_id, enrollment_id) do update
    set
      charge_id = excluded.charge_id,
      entry_status = 'confirmed',
      signed_up_at = excluded.signed_up_at,
      updated_at = excluded.updated_at
    where existing_entry.entry_status <> 'confirmed'
       or existing_entry.charge_id is distinct from excluded.charge_id
    returning existing_entry.tournament_id
  )
  select inserted_entries.tournament_id
  from inserted_entries;
$$;

revoke all on function public.sync_paid_tournament_entries_for_charges(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.sync_paid_tournament_entries_for_charges(uuid, uuid[])
  to service_role;

comment on function public.sync_paid_tournament_entries_for_charges(uuid, uuid[]) is
  'Registers tournament charges funded by payment allocations, explicit credit applications, or both; queues sporting squad routing through the entry trigger.';
