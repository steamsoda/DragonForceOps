-- Trial classes v1: isolated pre-enrollment prospects, dated notes, and visits.
-- These tables intentionally do not write players, enrollments, attendance records,
-- charges, payments, or finance facts.

create table public.trial_prospects (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  preferred_training_group_id uuid not null references public.training_groups(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  gender text not null check (gender in ('male', 'female')),
  guardian_name text null,
  guardian_phone text not null,
  guardian_phone_normalized text not null,
  status text not null default 'active' check (status in ('active', 'converted', 'closed')),
  converted_player_id uuid null references public.players(id) on delete set null,
  converted_enrollment_id uuid null references public.enrollments(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  check (char_length(btrim(first_name)) between 1 and 100),
  check (char_length(btrim(last_name)) between 1 and 140),
  check (char_length(guardian_phone_normalized) between 7 and 15)
);

create index idx_trial_prospects_campus_status
  on public.trial_prospects(campus_id, status, created_at desc);

create index idx_trial_prospects_phone
  on public.trial_prospects(guardian_phone_normalized);

create index idx_trial_prospects_name_birth
  on public.trial_prospects(lower(first_name), lower(last_name), birth_date);

create table public.trial_prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.trial_prospects(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  body text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) between 1 and 2000)
);

create index idx_trial_prospect_notes_prospect
  on public.trial_prospect_notes(prospect_id, created_at desc);

create table public.trial_visits (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.trial_prospects(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  training_group_id uuid not null references public.training_groups(id) on delete restrict,
  attendance_session_id uuid not null references public.attendance_sessions(id) on delete restrict,
  visit_date date not null,
  visit_number integer not null check (visit_number between 1 and 3),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid null references auth.users(id) on delete set null,
  checked_in_by_email text null,
  coach_snapshot jsonb not null default '[]'::jsonb,
  note text null,
  created_at timestamptz not null default now(),
  unique (prospect_id, attendance_session_id),
  unique (prospect_id, visit_number),
  check (note is null or char_length(btrim(note)) <= 2000)
);

create index idx_trial_visits_prospect
  on public.trial_visits(prospect_id, checked_in_at desc);

create index idx_trial_visits_session
  on public.trial_visits(attendance_session_id);

alter table public.trial_prospects enable row level security;
alter table public.trial_prospect_notes enable row level security;
alter table public.trial_visits enable row level security;

revoke all on table public.trial_prospects from public, anon, authenticated;
revoke all on table public.trial_prospect_notes from public, anon, authenticated;
revoke all on table public.trial_visits from public, anon, authenticated;
grant all on table public.trial_prospects to service_role;
grant all on table public.trial_prospect_notes to service_role;
grant all on table public.trial_visits to service_role;

create or replace function public.record_trial_visit(
  p_prospect_id uuid,
  p_attendance_session_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_note text default null
)
returns public.trial_visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.trial_visits;
  v_prospect public.trial_prospects;
  v_session public.attendance_sessions;
  v_visit_count integer;
  v_coaches jsonb;
  v_result public.trial_visits;
begin
  select * into v_existing
  from public.trial_visits
  where prospect_id = p_prospect_id
    and attendance_session_id = p_attendance_session_id;

  if found then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_prospect_id::text, 0));

  -- A concurrent request may have inserted the same session while this request
  -- waited for the prospect lock. Return that visit instead of raising a unique error.
  select * into v_existing
  from public.trial_visits
  where prospect_id = p_prospect_id
    and attendance_session_id = p_attendance_session_id;

  if found then
    return v_existing;
  end if;

  select * into v_prospect
  from public.trial_prospects
  where id = p_prospect_id
  for update;

  if not found or v_prospect.status <> 'active' then
    raise exception 'trial_prospect_unavailable';
  end if;

  select * into v_session
  from public.attendance_sessions
  where id = p_attendance_session_id;

  if not found
    or v_session.campus_id <> v_prospect.campus_id
    or v_session.training_group_id is null
    or v_session.status = 'cancelled'
    or v_session.session_date <> (now() at time zone 'America/Monterrey')::date then
    raise exception 'trial_session_invalid';
  end if;

  select count(*)::integer into v_visit_count
  from public.trial_visits
  where prospect_id = p_prospect_id;

  if v_visit_count >= 3 then
    raise exception 'trial_limit_reached';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'coach_id', c.id,
        'name', btrim(concat_ws(' ', c.first_name, c.last_name)),
        'is_primary', tgc.is_primary
      )
      order by tgc.is_primary desc, c.first_name, c.last_name
    ),
    '[]'::jsonb
  ) into v_coaches
  from public.training_group_coaches tgc
  join public.coaches c on c.id = tgc.coach_id
  where tgc.training_group_id = v_session.training_group_id;

  insert into public.trial_visits (
    prospect_id,
    campus_id,
    training_group_id,
    attendance_session_id,
    visit_date,
    visit_number,
    checked_in_by,
    checked_in_by_email,
    coach_snapshot,
    note
  ) values (
    v_prospect.id,
    v_prospect.campus_id,
    v_session.training_group_id,
    v_session.id,
    v_session.session_date,
    v_visit_count + 1,
    p_actor_id,
    nullif(btrim(p_actor_email), ''),
    v_coaches,
    nullif(btrim(p_note), '')
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.record_trial_visit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_trial_visit(uuid, uuid, uuid, text, text) to service_role;

comment on table public.trial_prospects is
  'Pre-enrollment tryout prospects. Separate from players and enrollments until explicit conversion.';
comment on table public.trial_visits is
  'Tryout attendance ledger. Never included in academy attendance records, rates, streaks, or finance.';
comment on function public.record_trial_visit(uuid, uuid, uuid, text, text) is
  'Idempotently records one of three trial visits against today''s generated training session.';
