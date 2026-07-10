-- Player operational notes v1.
-- General free-text notes for staff context across player profile and Caja.

create table if not exists public.player_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  enrollment_id uuid null references public.enrollments(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  source_surface text not null default 'player_profile',
  body text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_email text null,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  deleted_by uuid null references auth.users(id) on delete set null,
  constraint player_notes_body_not_blank check (length(btrim(body)) > 0),
  constraint player_notes_body_length check (length(body) <= 2000),
  constraint player_notes_source_surface_check check (source_surface in ('player_profile', 'caja'))
);

create index if not exists idx_player_notes_player_created
  on public.player_notes (player_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_player_notes_enrollment_created
  on public.player_notes (enrollment_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_player_notes_campus_created
  on public.player_notes (campus_id, created_at desc)
  where deleted_at is null;

alter table public.player_notes enable row level security;

revoke all on public.player_notes from public, anon;
grant select, insert, update on public.player_notes to authenticated;
grant select, insert, update, delete on public.player_notes to service_role;

drop policy if exists player_notes_read_operational_campus on public.player_notes;
create policy player_notes_read_operational_campus on public.player_notes
  for select
  using (
    deleted_at is null
    and (
      campus_id in (select campus_id from public.current_user_allowed_campuses())
      or campus_id in (select campus_id from public.current_user_attendance_read_campuses())
    )
  );

drop policy if exists player_notes_insert_operational_campus on public.player_notes;
create policy player_notes_insert_operational_campus on public.player_notes
  for insert
  with check (
    created_by = auth.uid()
    and deleted_at is null
    and (
      campus_id in (select campus_id from public.current_user_allowed_campuses())
      or campus_id in (select campus_id from public.current_user_attendance_read_campuses())
    )
  );

drop policy if exists player_notes_soft_delete_own_or_director on public.player_notes;
create policy player_notes_soft_delete_own_or_director on public.player_notes
  for update
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or public.is_director_admin()
    )
    and (
      campus_id in (select campus_id from public.current_user_allowed_campuses())
      or campus_id in (select campus_id from public.current_user_attendance_read_campuses())
    )
  )
  with check (
    deleted_at is not null
    and (
      deleted_by = auth.uid()
      or public.is_director_admin()
    )
  );
