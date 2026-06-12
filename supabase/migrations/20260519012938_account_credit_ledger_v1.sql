-- Account credit ledger v1.
--
-- This migration is additive only. It does not rewrite existing payments,
-- allocations, charges, refunds, balance adjustments, or v_enrollment_balances.
-- Legacy implicit credits remain diagnostic-only until a reviewed conversion
-- workflow is implemented.

create table if not exists public.enrollment_credits (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  source_payment_id uuid null references public.payments(id) on delete restrict,
  source_charge_id uuid null references public.charges(id) on delete restrict,
  source_workflow text not null,
  original_amount numeric(12,2) not null check (original_amount > 0),
  currency text not null default 'MXN',
  status text not null default 'open',
  reason text not null,
  notes text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_by uuid null references auth.users(id) on delete restrict,
  voided_at timestamptz null,
  void_reason text null,
  constraint enrollment_credits_source_workflow_check check (
    source_workflow in (
      'eligible_payment_remainder',
      'reassignment_remainder',
      'refund_to_credit',
      'manual_admin_credit',
      'legacy_review_conversion'
    )
  ),
  constraint enrollment_credits_status_check check (status in ('open', 'fully_used', 'void')),
  constraint enrollment_credits_void_state_check check (
    (status = 'void' and voided_at is not null and voided_by is not null)
    or (status <> 'void' and voided_at is null and voided_by is null and void_reason is null)
  )
);

create table if not exists public.enrollment_credit_applications (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.enrollment_credits(id) on delete restrict,
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  applied_by uuid not null references auth.users(id) on delete restrict,
  applied_at timestamptz not null default now(),
  notes text null
);

create index if not exists idx_enrollment_credits_enrollment
  on public.enrollment_credits (enrollment_id);

create index if not exists idx_enrollment_credits_campus
  on public.enrollment_credits (campus_id);

create index if not exists idx_enrollment_credits_source_payment
  on public.enrollment_credits (source_payment_id)
  where source_payment_id is not null;

create index if not exists idx_enrollment_credits_source_charge
  on public.enrollment_credits (source_charge_id)
  where source_charge_id is not null;

create index if not exists idx_enrollment_credit_applications_credit
  on public.enrollment_credit_applications (credit_id);

create index if not exists idx_enrollment_credit_applications_charge
  on public.enrollment_credit_applications (charge_id);

create or replace function public.validate_enrollment_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_source_payment_enrollment_id uuid;
  v_source_charge_enrollment_id uuid;
begin
  select *
  into v_enrollment
  from public.enrollments e
  where e.id = new.enrollment_id;

  if not found then
    raise exception 'enrollment_not_found';
  end if;

  if new.campus_id <> v_enrollment.campus_id then
    raise exception 'credit_campus_mismatch';
  end if;

  if new.source_payment_id is not null then
    select p.enrollment_id
    into v_source_payment_enrollment_id
    from public.payments p
    where p.id = new.source_payment_id;

    if not found then
      raise exception 'source_payment_not_found';
    end if;

    if v_source_payment_enrollment_id <> new.enrollment_id then
      raise exception 'source_payment_enrollment_mismatch';
    end if;
  end if;

  if new.source_charge_id is not null then
    select c.enrollment_id
    into v_source_charge_enrollment_id
    from public.charges c
    where c.id = new.source_charge_id;

    if not found then
      raise exception 'source_charge_not_found';
    end if;

    if v_source_charge_enrollment_id <> new.enrollment_id then
      raise exception 'source_charge_enrollment_mismatch';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_enrollment_credit_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.enrollment_credits%rowtype;
  v_charge public.charges%rowtype;
  v_applied numeric(12,2);
begin
  select *
  into v_credit
  from public.enrollment_credits ec
  where ec.id = new.credit_id
  for update;

  if not found then
    raise exception 'credit_not_found';
  end if;

  if v_credit.status = 'void' then
    raise exception 'credit_void';
  end if;

  select *
  into v_charge
  from public.charges c
  where c.id = new.charge_id;

  if not found then
    raise exception 'charge_not_found';
  end if;

  if v_charge.enrollment_id <> v_credit.enrollment_id then
    raise exception 'credit_charge_enrollment_mismatch';
  end if;

  if v_charge.status = 'void' then
    raise exception 'target_charge_void';
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(eca.amount), 0)::numeric(12,2)
    into v_applied
    from public.enrollment_credit_applications eca
    where eca.credit_id = new.credit_id
      and eca.id <> old.id;
  else
    select coalesce(sum(eca.amount), 0)::numeric(12,2)
    into v_applied
    from public.enrollment_credit_applications eca
    where eca.credit_id = new.credit_id;
  end if;

  if v_applied + new.amount > v_credit.original_amount + 0.009 then
    raise exception 'credit_application_exceeds_available';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_enrollment_credit
  on public.enrollment_credits;

create trigger trg_validate_enrollment_credit
  before insert or update on public.enrollment_credits
  for each row
  execute function public.validate_enrollment_credit();

drop trigger if exists trg_validate_enrollment_credit_application
  on public.enrollment_credit_applications;

create trigger trg_validate_enrollment_credit_application
  before insert or update on public.enrollment_credit_applications
  for each row
  execute function public.validate_enrollment_credit_application();

create or replace view public.v_enrollment_credit_balances
  with (security_invoker = true)
as
with applied as (
  select
    eca.credit_id,
    coalesce(sum(eca.amount), 0)::numeric(12,2) as applied_amount
  from public.enrollment_credit_applications eca
  group by eca.credit_id
),
credit_rows as (
  select
    ec.enrollment_id,
    ec.campus_id,
    ec.status,
    ec.original_amount,
    coalesce(a.applied_amount, 0)::numeric(12,2) as applied_amount,
    greatest(ec.original_amount - coalesce(a.applied_amount, 0), 0)::numeric(12,2) as available_amount
  from public.enrollment_credits ec
  left join applied a on a.credit_id = ec.id
)
select
  cr.enrollment_id,
  cr.campus_id,
  coalesce(sum(cr.original_amount) filter (where cr.status <> 'void'), 0)::numeric(12,2) as original_credit_total,
  coalesce(sum(cr.applied_amount) filter (where cr.status <> 'void'), 0)::numeric(12,2) as applied_credit_total,
  coalesce(sum(cr.available_amount) filter (where cr.status = 'open'), 0)::numeric(12,2) as available_credit_total,
  count(*) filter (where cr.status = 'open' and cr.available_amount > 0.009)::int as open_credit_count
from credit_rows cr
group by cr.enrollment_id, cr.campus_id;

create or replace view public.v_enrollment_credit_events
  with (security_invoker = true)
as
select
  ec.id as event_id,
  ec.id as credit_id,
  null::uuid as application_id,
  ec.enrollment_id,
  ec.campus_id,
  'credit_created'::text as event_type,
  ec.original_amount as amount,
  ec.currency,
  ec.source_workflow,
  ec.source_payment_id,
  ec.source_charge_id,
  null::uuid as target_charge_id,
  ec.reason,
  ec.notes,
  ec.created_by as actor_id,
  ec.created_at as occurred_at
from public.enrollment_credits ec
union all
select
  eca.id as event_id,
  ec.id as credit_id,
  eca.id as application_id,
  ec.enrollment_id,
  ec.campus_id,
  'credit_applied'::text as event_type,
  eca.amount,
  ec.currency,
  ec.source_workflow,
  ec.source_payment_id,
  ec.source_charge_id,
  eca.charge_id as target_charge_id,
  ec.reason,
  eca.notes,
  eca.applied_by as actor_id,
  eca.applied_at as occurred_at
from public.enrollment_credit_applications eca
join public.enrollment_credits ec on ec.id = eca.credit_id
union all
select
  ec.id as event_id,
  ec.id as credit_id,
  null::uuid as application_id,
  ec.enrollment_id,
  ec.campus_id,
  'credit_voided'::text as event_type,
  ec.original_amount as amount,
  ec.currency,
  ec.source_workflow,
  ec.source_payment_id,
  ec.source_charge_id,
  null::uuid as target_charge_id,
  coalesce(ec.void_reason, ec.reason) as reason,
  ec.notes,
  ec.voided_by as actor_id,
  ec.voided_at as occurred_at
from public.enrollment_credits ec
where ec.status = 'void';

alter table public.enrollment_credits enable row level security;
alter table public.enrollment_credit_applications enable row level security;

drop policy if exists enrollment_credits_read on public.enrollment_credits;
create policy enrollment_credits_read on public.enrollment_credits
  for select to authenticated
  using (public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists enrollment_credit_applications_read on public.enrollment_credit_applications;
create policy enrollment_credit_applications_read on public.enrollment_credit_applications
  for select to authenticated
  using (
    exists (
      select 1
      from public.enrollment_credits ec
      where ec.id = enrollment_credit_applications.credit_id
        and public.current_user_can_access_enrollment(ec.enrollment_id)
    )
  );

revoke all on table public.enrollment_credits from public, anon;
revoke all on table public.enrollment_credit_applications from public, anon;
revoke all on table public.v_enrollment_credit_balances from public, anon;
revoke all on table public.v_enrollment_credit_events from public, anon;

grant select on table public.enrollment_credits to authenticated;
grant select on table public.enrollment_credit_applications to authenticated;
grant select on table public.v_enrollment_credit_balances to authenticated;
grant select on table public.v_enrollment_credit_events to authenticated;
