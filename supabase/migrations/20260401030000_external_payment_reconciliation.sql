do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_payment_reconciliation_status') then
    create type public.external_payment_reconciliation_status as enum ('unmatched', 'matched', 'ignored', 'refunded');
  end if;
end $$;

create table if not exists public.external_payment_events (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null default 'invoice_export_manual'
    check (source_kind in ('invoice_export_manual')),
  provider text not null default 'stripe_360player'
    check (provider in ('stripe_360player')),
  external_ref text not null unique,
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  currency text not null default 'MXN',
  paid_at timestamptz not null,
  reconciliation_status public.external_payment_reconciliation_status not null default 'unmatched',
  payer_name text null,
  payer_email text null,
  assigned_player_name text null,
  provider_group_label text null,
  invoice_description text null,
  invoice_number text null,
  provider_invoice_id text null,
  stripe_charge_id text null,
  stripe_payment_intent_id text null,
  stripe_invoice_id text null,
  stripe_fee_amount numeric(12,2) null check (stripe_fee_amount is null or stripe_fee_amount >= 0),
  stripe_fee_tax_amount numeric(12,2) null check (stripe_fee_tax_amount is null or stripe_fee_tax_amount >= 0),
  platform_fee_amount numeric(12,2) null check (platform_fee_amount is null or platform_fee_amount >= 0),
  matched_enrollment_id uuid null references public.enrollments(id) on delete set null,
  matched_charge_id uuid null references public.charges(id) on delete set null,
  matched_payment_id uuid null references public.payments(id) on delete set null,
  ignored_reason text null,
  notes text null,
  raw_payload jsonb null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    reconciliation_status <> 'ignored'
    or ignored_reason is not null
  )
);

create unique index if not exists uq_external_payment_events_matched_payment
  on public.external_payment_events (matched_payment_id)
  where matched_payment_id is not null;

create index if not exists idx_external_payment_events_status_paid_at
  on public.external_payment_events (reconciliation_status, paid_at desc);

create index if not exists idx_external_payment_events_paid_at
  on public.external_payment_events (paid_at desc);

create index if not exists idx_external_payment_events_provider_invoice
  on public.external_payment_events (provider_invoice_id);

create index if not exists idx_external_payment_events_assigned_player
  on public.external_payment_events (assigned_player_name);

alter table public.external_payment_events enable row level security;

drop policy if exists director_admin_all_external_payment_events on public.external_payment_events;
create policy director_admin_all_external_payment_events on public.external_payment_events
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

drop policy if exists front_desk_read_external_payment_events on public.external_payment_events;
create policy front_desk_read_external_payment_events on public.external_payment_events
  for select to authenticated
  using (public.is_front_desk());

drop policy if exists front_desk_insert_external_payment_events on public.external_payment_events;
create policy front_desk_insert_external_payment_events on public.external_payment_events
  for insert to authenticated
  with check (public.is_front_desk());

drop policy if exists front_desk_update_external_payment_events on public.external_payment_events;
create policy front_desk_update_external_payment_events on public.external_payment_events
  for update to authenticated
  using (public.is_front_desk())
  with check (public.is_front_desk());
