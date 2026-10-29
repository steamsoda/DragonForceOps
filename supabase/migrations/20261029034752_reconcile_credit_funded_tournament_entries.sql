-- Repair missing registrations only; never modify money or replace an existing
-- registration, exclusion, or manually chosen squad. Future checkout and credit
-- selection already call the credit-aware registration sync transactionally.
do $$
declare
  repaired record;
  approving_actor uuid;
begin
  -- Same approving administrator as previous account-reconciliation migrations.
  select id into approving_actor from auth.users
  where lower(email) = 'javierg@dragonforcemty.com';
  for repaired in
    with candidates as (
      select t.id as tournament_id, c.enrollment_id, c.id as charge_id,
        row_number() over (
          partition by t.id, c.enrollment_id
          order by case when c.product_id = t.product_id then 0 else 1 end, c.created_at, c.id
        ) as rank
      from public.charges c
      join public.enrollments e on e.id = c.enrollment_id and e.status = 'active'
      join public.players p on p.id = e.player_id
      join public.tournaments t on t.campus_id = e.campus_id
        and t.is_active and t.product_id is not null
        and (t.end_date is null or t.end_date >= (now() at time zone 'America/Monterrey')::date)
        and (t.product_id = c.product_id or exists (
          select 1 from public.product_bundle_entitlements b
          where b.source_product_id = c.product_id and b.target_product_id = t.product_id
            and b.is_active and (b.gender is null or b.gender = lower(coalesce(p.gender, '')))
        ))
      left join lateral (
        select sum(a.amount) as amount from public.payment_allocations a where a.charge_id = c.id
      ) payments on true
      join lateral (
        select sum(a.amount) as amount from public.enrollment_credit_applications a where a.charge_id = c.id
      ) credits on credits.amount > 0
      where c.status <> 'void' and c.amount > 0
        and coalesce(payments.amount, 0) + credits.amount + 0.009 >= c.amount
        and coalesce(payments.amount, 0) + 0.009 < c.amount
        and not exists (
          select 1 from public.tournament_player_entries existing
          where existing.tournament_id = t.id and existing.enrollment_id = c.enrollment_id
        )
    )
    insert into public.tournament_player_entries (
      tournament_id, enrollment_id, charge_id, entry_status, signed_up_at, updated_at
    )
    select tournament_id, enrollment_id, charge_id, 'confirmed', now(), now()
    from candidates where rank = 1
    on conflict (tournament_id, enrollment_id) do nothing
    returning id, tournament_id, enrollment_id, charge_id
  loop
    if approving_actor is null then
      raise exception 'Missing approving administrator for credit registration repair';
    end if;
    insert into public.audit_logs(actor_user_id, actor_email, action, table_name, record_id, after_data)
    values (approving_actor, 'javierg@dragonforcemty.com', 'tournament.credit_funding_reconciled', 'tournament_player_entries', repaired.id,
      jsonb_build_object('tournament_id', repaired.tournament_id,
        'enrollment_id', repaired.enrollment_id, 'charge_id', repaired.charge_id,
        'migration', '20261029034752', 'reason', 'Missing credit-funded tournament registration'));

    -- Existing routing respects split decisions, invitations, and exclusions.
    perform public.reconcile_competition_roster_entry(repaired.tournament_id, repaired.enrollment_id);
  end loop;
end;
$$;
