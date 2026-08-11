-- Competition squads inherit professors from their source training group by
-- default. Combined squads require an explicit assignment so unrelated group
-- professors are never silently merged.

alter table public.competition_roster_squads
  add column if not exists coach_assignment_mode text not null default 'inherited'
    check (coach_assignment_mode in ('inherited', 'manual'));

update public.competition_roster_squads squad
set coach_assignment_mode = 'manual'
where (
  select count(*)
  from public.competition_roster_squad_groups source_group
  where source_group.squad_id = squad.id
) > 1;

create table if not exists public.competition_roster_squad_coaches (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.competition_roster_squads(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete restrict,
  is_primary boolean not null default false,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (squad_id, coach_id)
);

create index if not exists idx_competition_roster_squad_coaches_squad
  on public.competition_roster_squad_coaches(squad_id, is_primary desc, coach_id);

create unique index if not exists uq_competition_roster_squad_coaches_primary
  on public.competition_roster_squad_coaches(squad_id)
  where is_primary;

create or replace function public.keep_combined_squad_professors_manual()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_squad_id uuid := coalesce(new.squad_id, old.squad_id);
begin
  if (
    select count(*)
    from public.competition_roster_squad_groups source_group
    where source_group.squad_id = v_squad_id
  ) > 1 then
    update public.competition_roster_squads
      set coach_assignment_mode = 'manual', updated_at = now()
      where id = v_squad_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_combined_squad_professors_manual() from public, anon;

drop trigger if exists keep_combined_squad_professors_manual on public.competition_roster_squad_groups;
create trigger keep_combined_squad_professors_manual
  after insert or delete on public.competition_roster_squad_groups
  for each row execute function public.keep_combined_squad_professors_manual();

alter table public.competition_roster_squad_coaches enable row level security;

create policy competition_roster_squad_coaches_read
  on public.competition_roster_squad_coaches
  for select to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_coaches.squad_id
      and public.can_access_campus(tournament.campus_id)
  ));

create policy competition_roster_squad_coaches_manage
  on public.competition_roster_squad_coaches
  for all to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_coaches.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ))
  with check (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_coaches.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

revoke all on public.competition_roster_squad_coaches from public, anon;
grant select, insert, update, delete on public.competition_roster_squad_coaches to authenticated;

create or replace function public.set_competition_roster_squad_coaches(
  p_squad_id uuid,
  p_coach_ids uuid[],
  p_primary_coach_id uuid default null,
  p_use_inherited boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_campus_id uuid;
  v_source_group_count integer;
  v_coach_ids uuid[] := coalesce(p_coach_ids, '{}'::uuid[]);
begin
  select squad.tournament_id, tournament.campus_id,
    (select count(*) from public.competition_roster_squad_groups source_group where source_group.squad_id = squad.id)
    into v_tournament_id, v_campus_id, v_source_group_count
  from public.competition_roster_squads squad
  join public.tournaments tournament on tournament.id = squad.tournament_id
  where squad.id = p_squad_id
    and squad.status <> 'archived';

  if v_tournament_id is null or not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_squad_professor_manager_required';
  end if;

  if p_use_inherited then
    if v_source_group_count <> 1 then
      raise exception 'combined_squad_requires_manual_professor';
    end if;

    delete from public.competition_roster_squad_coaches where squad_id = p_squad_id;
    update public.competition_roster_squads
      set coach_assignment_mode = 'inherited', updated_by = auth.uid(), updated_at = now()
      where id = p_squad_id;
  else
    if cardinality(v_coach_ids) = 0 then
      raise exception 'competition_squad_professor_required';
    end if;

    if cardinality(v_coach_ids) <> (
      select count(distinct selected.coach_id)
      from unnest(v_coach_ids) as selected(coach_id)
    ) then
      raise exception 'competition_squad_professor_duplicate';
    end if;

    if p_primary_coach_id is null or not (p_primary_coach_id = any(v_coach_ids)) then
      raise exception 'competition_squad_primary_professor_required';
    end if;

    if exists (
      select 1
      from unnest(v_coach_ids) selected(coach_id)
      left join public.coaches coach on coach.id = selected.coach_id
      where coach.id is null
        or not coach.is_active
        or (coach.campus_id is not null and coach.campus_id <> v_campus_id)
    ) then
      raise exception 'competition_squad_professor_invalid';
    end if;

    delete from public.competition_roster_squad_coaches where squad_id = p_squad_id;
    insert into public.competition_roster_squad_coaches (
      squad_id, coach_id, is_primary, assigned_by
    )
    select p_squad_id, selected.coach_id, selected.coach_id = p_primary_coach_id, auth.uid()
    from unnest(v_coach_ids) selected(coach_id);

    update public.competition_roster_squads
      set coach_assignment_mode = 'manual', updated_by = auth.uid(), updated_at = now()
      where id = p_squad_id;
  end if;

  insert into public.competition_roster_events (
    tournament_id, squad_id, event_type, details, actor_id
  ) values (
    v_tournament_id,
    p_squad_id,
    case when p_use_inherited then 'squad_professors_inherited' else 'squad_professors_assigned' end,
    jsonb_build_object(
      'assignment_mode', case when p_use_inherited then 'inherited' else 'manual' end,
      'coach_ids', case when p_use_inherited then '[]'::jsonb else to_jsonb(v_coach_ids) end,
      'primary_coach_id', case when p_use_inherited then null else p_primary_coach_id end
    ),
    auth.uid()
  );
end;
$$;

revoke all on function public.set_competition_roster_squad_coaches(uuid, uuid[], uuid, boolean) from public, anon;
grant execute on function public.set_competition_roster_squad_coaches(uuid, uuid[], uuid, boolean) to authenticated;

comment on column public.competition_roster_squads.coach_assignment_mode is
  'Inherited uses the single source training group professors. Manual uses competition_roster_squad_coaches and is required for combined squads.';
comment on table public.competition_roster_squad_coaches is
  'Explicit tournament-squad professor overrides. Training-group professor assignments remain unchanged.';
