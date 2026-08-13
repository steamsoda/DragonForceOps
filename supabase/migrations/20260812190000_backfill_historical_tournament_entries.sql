-- Historical regularization payments predated targeted tournament-entry sync.
-- Backfill only active tournaments backed by an exact, fully allocated product
-- charge in the same campus. Ledger and training data remain untouched.

insert into public.tournament_player_entries (
  tournament_id,
  enrollment_id,
  charge_id,
  entry_status,
  signed_up_at,
  updated_at
)
select
  tournament.id,
  charge.enrollment_id,
  charge.id,
  'confirmed',
  coalesce(payment_dates.paid_at, charge.created_at),
  now()
from public.charges charge
join public.enrollments enrollment
  on enrollment.id = charge.enrollment_id
join public.tournaments tournament
  on tournament.campus_id = enrollment.campus_id
 and tournament.product_id = charge.product_id
 and tournament.is_active = true
cross join lateral (
  select
    sum(allocation.amount)::numeric(12, 2) as allocated_amount,
    max(coalesce(payment.paid_at, payment.created_at, allocation.created_at)) as paid_at
  from public.payment_allocations allocation
  join public.payments payment
    on payment.id = allocation.payment_id
   and payment.status = 'posted'
  where allocation.charge_id = charge.id
) payment_dates
where charge.product_id is not null
  and charge.status <> 'void'
  and charge.amount > 0
  and payment_dates.allocated_amount + 0.009 >= charge.amount
  and not exists (
    select 1
    from public.tournament_player_entries existing_entry
    where existing_entry.tournament_id = tournament.id
      and existing_entry.enrollment_id = charge.enrollment_id
  )
on conflict (tournament_id, enrollment_id) do nothing;

-- Entry inserts queue competition-team routing. Process this bounded backfill
-- immediately; any ambiguous split remains queued for sporting review.
select public.process_competition_roster_sync_queue(1000, null);
