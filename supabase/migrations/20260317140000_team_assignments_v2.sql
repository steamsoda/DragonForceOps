-- ── Team assignments v2 ───────────────────────────────────────────────────────
--
-- Adds:
--   is_new_arrival  — set true on auto-assign at enrollment, cleared by director
--   role            — 'regular' (normal member) | 'refuerzo' (guest for tournaments)
--
-- is_primary remains: true = player's main team, false = secondary (refuerzo)
-- Updating players.level is handled at the application layer.

alter table public.team_assignments
  add column if not exists is_new_arrival boolean not null default false,
  add column if not exists role text not null default 'regular';

alter table public.team_assignments
  drop constraint if exists team_assignments_role_check;

alter table public.team_assignments
  add constraint team_assignments_role_check
  check (role in ('regular', 'refuerzo'));

-- Fast lookup: new arrivals per team (for team list page counts)
create index if not exists idx_team_assignments_new_arrivals
  on public.team_assignments (team_id)
  where is_new_arrival = true and end_date is null;

-- ── RPC: team player counts for list page ────────────────────────────────────

create or replace function public.list_teams_with_counts()
returns table (
  team_id          uuid,
  player_count     int,
  new_arrival_count int
)
language sql
security definer
stable
as $$
  select
    ta.team_id,
    count(*)::int                                                    as player_count,
    sum(case when ta.is_new_arrival then 1 else 0 end)::int         as new_arrival_count
  from public.team_assignments ta
  join public.enrollments e on e.id = ta.enrollment_id and e.status = 'active'
  where ta.end_date is null
  group by ta.team_id;
$$;

grant execute on function public.list_teams_with_counts() to authenticated;
