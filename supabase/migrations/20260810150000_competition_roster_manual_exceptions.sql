-- Audited tournament-roster exceptions. These operations only change the
-- competition roster layer; paid registration, finance, attendance,
-- enrollments, and training-group assignments remain untouched.

create or replace function public.validate_competition_roster_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_tournament_campus_id uuid;
  v_record_campus_id uuid;
begin
  if tg_table_name = 'competition_roster_squad_groups' then
    select squad.tournament_id, tournament.campus_id, training_group.campus_id
      into v_tournament_id, v_tournament_campus_id, v_record_campus_id
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    join public.training_groups training_group on training_group.id = new.training_group_id
    where squad.id = new.squad_id;
  elsif tg_table_name = 'competition_roster_squad_members' then
    select squad.tournament_id, tournament.campus_id, enrollment.campus_id
      into v_tournament_id, v_tournament_campus_id, v_record_campus_id
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    join public.enrollments enrollment on enrollment.id = new.enrollment_id
    where squad.id = new.squad_id;

    if exists (
      select 1
      from public.competition_roster_exclusions exclusion
      where exclusion.tournament_id = v_tournament_id
        and exclusion.enrollment_id = new.enrollment_id
    ) then
      raise exception 'competition_roster_member_is_excluded';
    end if;
  elsif tg_table_name = 'competition_roster_exclusions' then
    select tournament.campus_id, enrollment.campus_id
      into v_tournament_campus_id, v_record_campus_id
    from public.tournaments tournament
    join public.enrollments enrollment on enrollment.id = new.enrollment_id
    where tournament.id = new.tournament_id;

    if exists (
      select 1
      from public.competition_roster_squad_members member
      join public.competition_roster_squads squad on squad.id = member.squad_id
      where squad.tournament_id = new.tournament_id
        and squad.status <> 'archived'
        and member.enrollment_id = new.enrollment_id
    ) then
      raise exception 'competition_roster_exclusion_has_membership';
    end if;
  end if;

  if v_tournament_campus_id is null or v_record_campus_id is null then
    raise exception 'competition_roster_scope_not_found';
  end if;

  if v_tournament_campus_id <> v_record_campus_id then
    raise exception 'competition_roster_campus_mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.set_competition_roster_exclusion(
  p_tournament_id uuid,
  p_enrollment_id uuid,
  p_reason text,
  p_excluded boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_campus_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_removed_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 240 then
    raise exception 'competition_roster_exception_invalid_reason';
  end if;

  select tournament.campus_id
    into v_campus_id
  from public.tournaments tournament
  join public.enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.campus_id = tournament.campus_id
   and enrollment.status = 'active'
  join public.tournament_player_entries entry
    on entry.tournament_id = tournament.id
   and entry.enrollment_id = enrollment.id
   and entry.entry_status = 'confirmed'
  where tournament.id = p_tournament_id
    and tournament.is_active = true
  for update of tournament, enrollment, entry;

  if v_campus_id is null then
    raise exception 'competition_roster_confirmed_player_not_found';
  end if;
  if not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;

  if p_excluded then
    delete from public.competition_roster_squad_members member
    using public.competition_roster_squads squad
    where member.squad_id = squad.id
      and squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and member.enrollment_id = p_enrollment_id;
    get diagnostics v_removed_count = row_count;

    insert into public.competition_roster_exclusions (
      tournament_id, enrollment_id, reason, excluded_by
    ) values (
      p_tournament_id, p_enrollment_id, v_reason, v_actor_id
    )
    on conflict (tournament_id, enrollment_id) do update
      set reason = excluded.reason,
          excluded_by = excluded.excluded_by,
          updated_at = now();

    insert into public.competition_roster_events (
      tournament_id, enrollment_id, event_type, details, actor_id
    ) values (
      p_tournament_id,
      p_enrollment_id,
      'member.excluded',
      jsonb_build_object('reason', v_reason, 'active_memberships_removed', v_removed_count),
      v_actor_id
    );
  else
    delete from public.competition_roster_exclusions exclusion
    where exclusion.tournament_id = p_tournament_id
      and exclusion.enrollment_id = p_enrollment_id;

    if not found then
      raise exception 'competition_roster_exclusion_not_found';
    end if;

    insert into public.competition_roster_events (
      tournament_id, enrollment_id, event_type, details, actor_id
    ) values (
      p_tournament_id,
      p_enrollment_id,
      'member.reinstated',
      jsonb_build_object('reason', v_reason, 'assignment', 'pending'),
      v_actor_id
    );
  end if;

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'excluded', p_excluded,
    'active_memberships_removed', v_removed_count
  );
end;
$$;

create or replace function public.set_competition_roster_manual_member(
  p_squad_id uuid,
  p_enrollment_id uuid,
  p_reason text,
  p_added boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tournament_id uuid;
  v_campus_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_existing_source text;
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 240 then
    raise exception 'competition_roster_exception_invalid_reason';
  end if;

  select squad.tournament_id, tournament.campus_id
    into v_tournament_id, v_campus_id
  from public.competition_roster_squads squad
  join public.tournaments tournament
    on tournament.id = squad.tournament_id
   and tournament.is_active = true
  join public.enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.campus_id = tournament.campus_id
   and enrollment.status = 'active'
  where squad.id = p_squad_id
    and squad.status <> 'archived'
  for update of squad, tournament, enrollment;

  if v_tournament_id is null or v_campus_id is null then
    raise exception 'competition_roster_manual_scope_not_found';
  end if;
  if not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;

  select member.source
    into v_existing_source
  from public.competition_roster_squad_members member
  where member.squad_id = p_squad_id
    and member.enrollment_id = p_enrollment_id
  for update;

  if p_added then
    if exists (
      select 1
      from public.competition_roster_exclusions exclusion
      where exclusion.tournament_id = v_tournament_id
        and exclusion.enrollment_id = p_enrollment_id
    ) then
      raise exception 'competition_roster_member_is_excluded';
    end if;
    if v_existing_source = 'paid' then
      raise exception 'competition_roster_member_already_paid';
    end if;

    insert into public.competition_roster_squad_members (
      squad_id, enrollment_id, source, reason, added_by
    ) values (
      p_squad_id, p_enrollment_id, 'manual', v_reason, v_actor_id
    )
    on conflict (squad_id, enrollment_id) do update
      set source = 'manual',
          reason = excluded.reason,
          added_by = excluded.added_by,
          updated_at = now();

    insert into public.competition_roster_events (
      tournament_id, squad_id, enrollment_id, event_type, details, actor_id
    ) values (
      v_tournament_id,
      p_squad_id,
      p_enrollment_id,
      'member.manual_added',
      jsonb_build_object('reason', v_reason),
      v_actor_id
    );
  else
    delete from public.competition_roster_squad_members member
    where member.squad_id = p_squad_id
      and member.enrollment_id = p_enrollment_id
      and member.source = 'manual';

    if not found then
      raise exception 'competition_roster_manual_member_not_found';
    end if;

    insert into public.competition_roster_events (
      tournament_id, squad_id, enrollment_id, event_type, details, actor_id
    ) values (
      v_tournament_id,
      p_squad_id,
      p_enrollment_id,
      'member.manual_removed',
      jsonb_build_object('reason', v_reason),
      v_actor_id
    );
  end if;

  return jsonb_build_object(
    'squad_id', p_squad_id,
    'enrollment_id', p_enrollment_id,
    'manual_member', p_added
  );
end;
$$;

revoke all on function public.set_competition_roster_exclusion(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_competition_roster_exclusion(uuid, uuid, text, boolean) to authenticated;

revoke all on function public.set_competition_roster_manual_member(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_competition_roster_manual_member(uuid, uuid, text, boolean) to authenticated;

comment on function public.set_competition_roster_exclusion(uuid, uuid, text, boolean) is
  'Excludes or reinstates a confirmed paid tournament entry from active competition squads without changing registration or finance.';

comment on function public.set_competition_roster_manual_member(uuid, uuid, text, boolean) is
  'Adds or removes an audited same-campus active player as a manual tournament-squad helper without changing finance or training assignments.';
