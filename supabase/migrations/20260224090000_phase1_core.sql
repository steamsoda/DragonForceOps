-- Phase 1 Core Schema - FC Porto Dragon Force Monterrey
-- Assumes Supabase environment with auth schema enabled.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'player_status') then
    create type public.player_status as enum ('active', 'inactive', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type public.enrollment_status as enum ('active', 'paused', 'ended', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'charge_status') then
    create type public.charge_status as enum ('pending', 'posted', 'void');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('posted', 'void', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash', 'transfer', 'card', 'stripe_360player', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'cash_session_status') then
    create type public.cash_session_status as enum ('open', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'cash_entry_type') then
    create type public.cash_entry_type as enum ('payment_in', 'manual_in', 'manual_out', 'adjustment');
  end if;
end $$;

-- Core reference tables
create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete restrict,
  campus_id uuid null references public.campuses(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, role_id, campus_id)
);

-- Master data
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  gender text null,
  status public.player_status not null default 'active',
  medical_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone_primary text not null,
  phone_secondary text null,
  email text null,
  relationship_label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_guardians (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, guardian_id)
);

-- Pricing + enrollment
create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'MXN',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_plan_tuition_rules (
  id uuid primary key default gen_random_uuid(),
  pricing_plan_id uuid not null references public.pricing_plans(id) on delete cascade,
  day_from int not null check (day_from between 1 and 31),
  day_to int null check (day_to is null or day_to between 1 and 31),
  amount numeric(12,2) not null check (amount >= 0),
  priority int not null default 1,
  created_at timestamptz not null default now(),
  check (day_to is null or day_to >= day_from),
  unique (pricing_plan_id, day_from, day_to)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  pricing_plan_id uuid not null references public.pricing_plans(id) on delete restrict,
  status public.enrollment_status not null default 'active',
  start_date date not null,
  end_date date null,
  inscription_date date not null default current_date,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  name text not null,
  age_group text null,
  season_label text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, name, season_label)
);

create table if not exists public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  start_date date not null,
  end_date date null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

-- Ledger
create table if not exists public.charge_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true
);

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  charge_type_id uuid not null references public.charge_types(id) on delete restrict,
  period_month date null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MXN',
  status public.charge_status not null default 'pending',
  due_date date null,
  pricing_rule_id uuid null references public.pricing_plan_tuition_rules(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  paid_at timestamptz not null default now(),
  method public.payment_method not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MXN',
  status public.payment_status not null default 'posted',
  provider_ref text null,
  external_source text not null default 'manual',
  notes text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, charge_id)
);

-- Cash register
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid null references auth.users(id) on delete restrict,
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  closing_cash_reported numeric(12,2) null check (closing_cash_reported >= 0),
  status public.cash_session_status not null default 'open',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_session_entries (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  payment_id uuid null references public.payments(id) on delete set null,
  entry_type public.cash_entry_type not null,
  amount numeric(12,2) not null check (amount <> 0),
  notes text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Audit logs
create table if not exists public.audit_logs (
  id bigserial primary key,
  event_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  table_name text not null,
  record_id uuid null,
  before_data jsonb null,
  after_data jsonb null,
  request_id text null,
  ip text null
);

-- Indexes
create index if not exists idx_players_name on public.players (last_name, first_name);
create index if not exists idx_players_status on public.players (status);

create index if not exists idx_guardians_phone_primary on public.guardians (phone_primary);
create index if not exists idx_guardians_email on public.guardians (email);
create index if not exists idx_player_guardians_player on public.player_guardians (player_id);
create index if not exists idx_player_guardians_guardian on public.player_guardians (guardian_id);

create index if not exists idx_enrollments_player_status on public.enrollments (player_id, status);
create index if not exists idx_enrollments_campus_status on public.enrollments (campus_id, status);
create unique index if not exists uq_enrollment_one_active_per_player
  on public.enrollments (player_id)
  where status = 'active';

create index if not exists idx_teams_campus_active on public.teams (campus_id, is_active);
create index if not exists idx_team_assignments_enrollment_start on public.team_assignments (enrollment_id, start_date desc);
create index if not exists idx_team_assignments_team on public.team_assignments (team_id);

create index if not exists idx_charges_enrollment_status_due on public.charges (enrollment_id, status, due_date);
create index if not exists idx_charges_period_month on public.charges (period_month);
create unique index if not exists uq_monthly_charge_per_enrollment_month
  on public.charges (enrollment_id, charge_type_id, period_month)
  where period_month is not null and status <> 'void';

create index if not exists idx_payments_enrollment_paid_at on public.payments (enrollment_id, paid_at desc);
create index if not exists idx_payments_method_paid_at on public.payments (method, paid_at desc);
create index if not exists idx_payments_provider_ref on public.payments (provider_ref);

create index if not exists idx_payment_allocations_charge on public.payment_allocations (charge_id);
create index if not exists idx_payment_allocations_payment on public.payment_allocations (payment_id);

create index if not exists idx_cash_sessions_campus_opened on public.cash_sessions (campus_id, opened_at desc);
create index if not exists idx_cash_session_entries_session on public.cash_session_entries (cash_session_id);

create index if not exists idx_audit_logs_event_at on public.audit_logs (event_at desc);
create index if not exists idx_audit_logs_table_event_at on public.audit_logs (table_name, event_at desc);

-- Enrollment balances view
create or replace view public.v_enrollment_balances as
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
    coalesce(sum(p.amount) filter (where p.status = 'posted'), 0)::numeric(12,2) as total_payments
  from public.payments p
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

-- Helper function for RLS
create or replace function public.is_director_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'director_admin'
  );
$$;

grant execute on function public.is_director_admin() to authenticated, anon;

-- Enable RLS across domain tables
alter table public.campuses enable row level security;
alter table public.app_roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.players enable row level security;
alter table public.guardians enable row level security;
alter table public.player_guardians enable row level security;
alter table public.pricing_plans enable row level security;
alter table public.pricing_plan_tuition_rules enable row level security;
alter table public.enrollments enable row level security;
alter table public.teams enable row level security;
alter table public.team_assignments enable row level security;
alter table public.charge_types enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_session_entries enable row level security;
alter table public.audit_logs enable row level security;

-- Director-admin full access (Phase 1)
drop policy if exists director_admin_all_campuses on public.campuses;
create policy director_admin_all_campuses on public.campuses
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_app_roles on public.app_roles;
create policy director_admin_all_app_roles on public.app_roles
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_user_roles on public.user_roles;
create policy director_admin_all_user_roles on public.user_roles
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_players on public.players;
create policy director_admin_all_players on public.players
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_guardians on public.guardians;
create policy director_admin_all_guardians on public.guardians
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_player_guardians on public.player_guardians;
create policy director_admin_all_player_guardians on public.player_guardians
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_pricing_plans on public.pricing_plans;
create policy director_admin_all_pricing_plans on public.pricing_plans
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_pricing_plan_tuition_rules on public.pricing_plan_tuition_rules;
create policy director_admin_all_pricing_plan_tuition_rules on public.pricing_plan_tuition_rules
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_enrollments on public.enrollments;
create policy director_admin_all_enrollments on public.enrollments
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_teams on public.teams;
create policy director_admin_all_teams on public.teams
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_team_assignments on public.team_assignments;
create policy director_admin_all_team_assignments on public.team_assignments
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_charge_types on public.charge_types;
create policy director_admin_all_charge_types on public.charge_types
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_charges on public.charges;
create policy director_admin_all_charges on public.charges
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_payments on public.payments;
create policy director_admin_all_payments on public.payments
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_payment_allocations on public.payment_allocations;
create policy director_admin_all_payment_allocations on public.payment_allocations
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_cash_sessions on public.cash_sessions;
create policy director_admin_all_cash_sessions on public.cash_sessions
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_all_cash_session_entries on public.cash_session_entries;
create policy director_admin_all_cash_session_entries on public.cash_session_entries
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists director_admin_select_audit_logs on public.audit_logs;
create policy director_admin_select_audit_logs on public.audit_logs
for select
using (public.is_director_admin());

drop policy if exists director_admin_insert_audit_logs on public.audit_logs;
create policy director_admin_insert_audit_logs on public.audit_logs
for insert
with check (public.is_director_admin());

-- Prevent updates/deletes on audit logs at DB policy level
drop policy if exists director_admin_update_audit_logs on public.audit_logs;
drop policy if exists director_admin_delete_audit_logs on public.audit_logs;

-- Seed data
insert into public.app_roles (code, name)
values
  ('director_admin', 'Director Admin'),
  ('admin_restricted', 'Restricted Admin'),
  ('coach', 'Coach')
on conflict (code) do nothing;

insert into public.campuses (code, name)
values
  ('LINDA_VISTA', 'Linda Vista'),
  ('CONTRY', 'Contry')
on conflict (code) do nothing;

insert into public.charge_types (code, name)
values
  ('monthly_tuition', 'Mensualidad'),
  ('inscription', 'Inscripcion'),
  ('uniform', 'Uniforme'),
  ('tournament', 'Torneo'),
  ('cup', 'Copa'),
  ('trip', 'Viaje'),
  ('event', 'Evento')
on conflict (code) do nothing;
