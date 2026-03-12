-- Academy events log — continuous logging throughout the month.
-- Staff log events as they happen; porto-mensual report reads them by month.
--
-- Columns match the Porto Eventos tab:
--   title, description, proposed_date, actual_date, is_done,
--   cost (optional), participant_count, evaluation (1–5), satisfaction_avg (1–5)
-- campus_id is optional — some events span both campuses.

create table public.academy_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text null,
  proposed_date    date not null,
  actual_date      date null,
  is_done          boolean not null default false,
  cost             numeric(10,2) null,
  participant_count int null,
  evaluation       smallint null check (evaluation between 1 and 5),
  satisfaction_avg numeric(3,1) null check (satisfaction_avg between 1.0 and 5.0),
  campus_id        uuid null references public.campuses(id) on delete set null,
  notes            text null,
  created_by       uuid null references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index academy_events_date_idx on public.academy_events (proposed_date);
create index academy_events_campus_idx on public.academy_events (campus_id);

alter table public.academy_events enable row level security;

-- All authenticated staff can read events
create policy "events_select_authenticated"
  on public.academy_events for select
  to authenticated
  using (true);

-- Operational access to insert (director_admin + front_desk)
create policy "events_insert_operational"
  on public.academy_events for insert
  to authenticated
  with check (public.has_operational_access());

-- Only director_admin can update or delete
create policy "events_update_director"
  on public.academy_events for update
  to authenticated
  using (public.is_director_admin());

create policy "events_delete_director"
  on public.academy_events for delete
  to authenticated
  using (public.is_director_admin());
