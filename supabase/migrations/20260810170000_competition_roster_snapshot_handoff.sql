-- Approved competition rosters become immutable sporting snapshots. A snapshot
-- may then seed a weekly WhatsApp callup without rereading payment eligibility
-- or changing the live competition roster.

alter table public.competition_roster_snapshot_members
  add column if not exists training_group_id_snapshot uuid null;

alter table public.weekly_callups
  add column if not exists competition_roster_snapshot_id uuid null
    references public.competition_roster_snapshots(id) on delete restrict;

alter table public.weekly_callup_categories
  add column if not exists competition_roster_snapshot_squad_id uuid null
    references public.competition_roster_snapshot_squads(id) on delete set null;

create index if not exists idx_weekly_callups_competition_snapshot
  on public.weekly_callups(competition_roster_snapshot_id)
  where competition_roster_snapshot_id is not null;

create index if not exists idx_weekly_callup_categories_snapshot_squad
  on public.weekly_callup_categories(competition_roster_snapshot_squad_id)
  where competition_roster_snapshot_squad_id is not null;

create or replace function public.capture_competition_roster_snapshot(
  p_tournament_id uuid,
  p_program text,
  p_label text,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_campus_id uuid;
  v_snapshot_id uuid;
  v_snapshot_squad_id uuid;
  v_squad record;
begin
  if v_actor is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if p_program not in ('futbol_para_todos', 'selectivo', 'little_dragons') then
    raise exception 'competition_roster_snapshot_invalid_program';
  end if;
  if char_length(btrim(coalesce(p_label, ''))) < 3
     or char_length(btrim(p_label)) > 100
     or char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'competition_roster_snapshot_invalid_details';
  end if;

  select tournament.campus_id
    into v_campus_id
  from public.tournaments tournament
  where tournament.id = p_tournament_id;

  if v_campus_id is null then
    raise exception 'competition_roster_snapshot_tournament_not_found';
  end if;
  if not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;
  if not exists (
    select 1
    from public.competition_roster_squads squad
    where squad.tournament_id = p_tournament_id
      and squad.program = p_program
      and squad.status <> 'archived'
      and exists (
        select 1 from public.competition_roster_squad_members member
        where member.squad_id = squad.id
      )
  ) then
    raise exception 'competition_roster_snapshot_empty';
  end if;

  if exists (
    select 1
    from public.tournament_player_entries entry
    join public.enrollments enrollment on enrollment.id = entry.enrollment_id
    join public.training_group_assignments assignment
      on assignment.enrollment_id = enrollment.id
     and assignment.end_date is null
    join public.training_groups training_group
      on training_group.id = assignment.training_group_id
    where entry.tournament_id = p_tournament_id
      and entry.entry_status = 'confirmed'
      and enrollment.status = 'active'
      and training_group.program = p_program
      and not exists (
        select 1
        from public.competition_roster_exclusions exclusion
        where exclusion.tournament_id = p_tournament_id
          and exclusion.enrollment_id = enrollment.id
      )
      and not exists (
        select 1
        from public.competition_roster_squad_members member
        join public.competition_roster_squads squad on squad.id = member.squad_id
        where squad.tournament_id = p_tournament_id
          and squad.program = p_program
          and squad.status <> 'archived'
          and member.enrollment_id = enrollment.id
      )
  ) then
    raise exception 'competition_roster_snapshot_pending_players';
  end if;

  insert into public.competition_roster_snapshots (
    tournament_id, label, captured_by, notes
  ) values (
    p_tournament_id,
    btrim(p_label),
    v_actor,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_snapshot_id;

  for v_squad in
    select squad.*
    from public.competition_roster_squads squad
    where squad.tournament_id = p_tournament_id
      and squad.program = p_program
      and squad.status <> 'archived'
      and exists (
        select 1 from public.competition_roster_squad_members member
        where member.squad_id = squad.id
      )
    order by squad.sort_order, squad.name, squad.id
  loop
    insert into public.competition_roster_snapshot_squads (
      snapshot_id,
      source_squad_id,
      name_snapshot,
      squad_kind_snapshot,
      program_snapshot,
      category_label_snapshot,
      gender_snapshot,
      source_group_names_snapshot,
      sort_order
    ) values (
      v_snapshot_id,
      v_squad.id,
      v_squad.name,
      v_squad.squad_kind,
      v_squad.program,
      v_squad.category_label,
      v_squad.gender,
      coalesce((
        select array_agg(training_group.name order by training_group.name)
        from public.competition_roster_squad_groups source_group
        join public.training_groups training_group on training_group.id = source_group.training_group_id
        where source_group.squad_id = v_squad.id
      ), '{}'::text[]),
      v_squad.sort_order
    ) returning id into v_snapshot_squad_id;

    insert into public.competition_roster_snapshot_members (
      snapshot_squad_id,
      enrollment_id,
      player_id,
      player_name_snapshot,
      player_public_id_snapshot,
      birth_year_snapshot,
      training_group_id_snapshot,
      training_group_name_snapshot,
      membership_source_snapshot,
      sort_order
    )
    select
      v_snapshot_squad_id,
      member.enrollment_id,
      enrollment.player_id,
      btrim(concat_ws(' ', player.first_name, player.last_name)),
      player.public_player_id,
      extract(year from player.birth_date)::int,
      current_assignment.training_group_id,
      training_group.name,
      member.source,
      row_number() over (
        order by player.last_name, player.first_name, player.id
      )::int - 1
    from public.competition_roster_squad_members member
    join public.enrollments enrollment on enrollment.id = member.enrollment_id
    join public.players player on player.id = enrollment.player_id
    left join lateral (
      select assignment.training_group_id
      from public.training_group_assignments assignment
      where assignment.enrollment_id = member.enrollment_id
        and assignment.end_date is null
      order by assignment.start_date desc, assignment.created_at desc, assignment.id desc
      limit 1
    ) current_assignment on true
    left join public.training_groups training_group on training_group.id = current_assignment.training_group_id
    where member.squad_id = v_squad.id
    order by player.last_name, player.first_name, player.id;

    update public.competition_roster_squads
    set status = 'ready', updated_by = v_actor, updated_at = now()
    where id = v_squad.id;
  end loop;

  insert into public.competition_roster_events (
    tournament_id, event_type, details, actor_id
  ) values (
    p_tournament_id,
    'snapshot.captured',
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'program', p_program,
      'label', btrim(p_label)
    ),
    v_actor
  );

  return v_snapshot_id;
end;
$$;

create or replace function public.create_weekly_callup_from_competition_snapshot(
  p_snapshot_id uuid,
  p_program text,
  p_week_start date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament_id uuid;
  v_campus_id uuid;
  v_callup_id uuid;
  v_category_id uuid;
  v_snapshot_squad record;
  v_coach_names text;
begin
  if v_actor is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if p_program not in ('futbol_para_todos', 'selectivo')
     or p_week_start is null
     or extract(isodow from p_week_start) <> 1 then
    raise exception 'competition_roster_callup_invalid_settings';
  end if;

  select snapshot.tournament_id, tournament.campus_id
    into v_tournament_id, v_campus_id
  from public.competition_roster_snapshots snapshot
  join public.tournaments tournament on tournament.id = snapshot.tournament_id
  where snapshot.id = p_snapshot_id;

  if v_tournament_id is null or v_campus_id is null then
    raise exception 'competition_roster_snapshot_not_found';
  end if;
  if not public.can_access_sports_campus(v_campus_id)
     or not public.can_manage_weekly_callup_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;
  if not exists (
    select 1
    from public.competition_roster_snapshot_squads snapshot_squad
    where snapshot_squad.snapshot_id = p_snapshot_id
      and snapshot_squad.program_snapshot = p_program
  ) then
    raise exception 'competition_roster_snapshot_program_empty';
  end if;

  insert into public.weekly_callups (
    campus_id,
    tournament_id,
    program,
    week_start,
    status,
    roster_snapshot_at,
    competition_roster_snapshot_id,
    created_by,
    updated_by
  ) values (
    v_campus_id,
    v_tournament_id,
    p_program,
    p_week_start,
    'ready',
    now(),
    p_snapshot_id,
    v_actor,
    v_actor
  ) returning id into v_callup_id;

  for v_snapshot_squad in
    select snapshot_squad.*
    from public.competition_roster_snapshot_squads snapshot_squad
    where snapshot_squad.snapshot_id = p_snapshot_id
      and snapshot_squad.program_snapshot = p_program
    order by snapshot_squad.sort_order, snapshot_squad.name_snapshot, snapshot_squad.id
  loop
    select string_agg(coach_name, ', ' order by primary_rank, coach_name)
      into v_coach_names
    from (
      select distinct
        btrim(concat_ws(' ', coach.first_name, coach.last_name)) as coach_name,
        case when assignment.is_primary then 0 else 1 end as primary_rank
      from public.competition_roster_squads source_squad
      join public.competition_roster_squad_groups source_group on source_group.squad_id = source_squad.id
      join public.training_group_coaches assignment on assignment.training_group_id = source_group.training_group_id
      join public.coaches coach on coach.id = assignment.coach_id and coach.is_active = true
      where source_squad.id = v_snapshot_squad.source_squad_id
    ) coach_rows
    where coach_name <> '';

    insert into public.weekly_callup_categories (
      weekly_callup_id,
      training_group_id,
      category_label,
      training_group_name_snapshot,
      tournament_name_snapshot,
      coach_names_snapshot,
      sort_order,
      is_rest,
      competition_roster_snapshot_squad_id
    )
    select
      v_callup_id,
      null,
      coalesce(nullif(v_snapshot_squad.category_label_snapshot, ''), v_snapshot_squad.name_snapshot),
      v_snapshot_squad.name_snapshot,
      tournament.name,
      coalesce(v_coach_names, 'Sin coach'),
      v_snapshot_squad.sort_order,
      false,
      v_snapshot_squad.id
    from public.tournaments tournament
    where tournament.id = v_tournament_id
    returning id into v_category_id;

    insert into public.weekly_callup_players (
      weekly_callup_category_id,
      enrollment_id,
      player_id,
      player_name_snapshot,
      birth_year,
      training_group_id,
      training_group_name_snapshot,
      eligibility_source,
      roster_status,
      source_snapshot_at
    )
    select
      v_category_id,
      member.enrollment_id,
      member.player_id,
      member.player_name_snapshot,
      member.birth_year_snapshot,
      member.training_group_id_snapshot,
      coalesce(member.training_group_name_snapshot, v_snapshot_squad.name_snapshot),
      case when member.membership_source_snapshot = 'manual' then 'manual_unpaid' else 'direct' end,
      'included',
      now()
    from public.competition_roster_snapshot_members member
    where member.snapshot_squad_id = v_snapshot_squad.id
      and member.enrollment_id is not null
      and member.player_id is not null
    order by member.sort_order, member.player_name_snapshot;
  end loop;

  insert into public.competition_roster_events (
    tournament_id, event_type, details, actor_id
  ) values (
    v_tournament_id,
    'snapshot.callup_created',
    jsonb_build_object(
      'snapshot_id', p_snapshot_id,
      'weekly_callup_id', v_callup_id,
      'program', p_program,
      'week_start', p_week_start
    ),
    v_actor
  );

  return v_callup_id;
exception
  when unique_violation then
    raise exception 'competition_roster_callup_already_exists';
end;
$$;

revoke all on function public.capture_competition_roster_snapshot(uuid, text, text, text)
  from public, anon;
grant execute on function public.capture_competition_roster_snapshot(uuid, text, text, text)
  to authenticated;

revoke all on function public.create_weekly_callup_from_competition_snapshot(uuid, text, date)
  from public, anon;
grant execute on function public.create_weekly_callup_from_competition_snapshot(uuid, text, date)
  to authenticated;

comment on column public.competition_roster_snapshot_members.training_group_id_snapshot is
  'Training group identifier at approval time; historical sporting context only.';
comment on column public.weekly_callups.competition_roster_snapshot_id is
  'Approved competition-roster snapshot that seeded this frozen weekly packet.';
comment on column public.weekly_callup_categories.competition_roster_snapshot_squad_id is
  'Approved Azul, Blanco, single, or combined squad copied into this category.';
