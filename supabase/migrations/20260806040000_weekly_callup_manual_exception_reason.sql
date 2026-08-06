-- Director-only unpaid callup exceptions must retain their operational reason.
-- Existing paid snapshots are unaffected.

alter table public.weekly_callup_players
  add column if not exists manual_reason text null;

update public.weekly_callup_players
set manual_reason = 'Excepcion registrada antes del motivo obligatorio.'
where eligibility_source = 'manual_unpaid'
  and length(btrim(coalesce(manual_reason, ''))) < 5;

alter table public.weekly_callup_players
  drop constraint if exists weekly_callup_players_manual_reason_check;

alter table public.weekly_callup_players
  add constraint weekly_callup_players_manual_reason_check
  check (
    eligibility_source <> 'manual_unpaid'
    or length(btrim(coalesce(manual_reason, ''))) >= 5
  );

comment on column public.weekly_callup_players.manual_reason is
  'Required reason when a director explicitly includes a player without a paid tournament entitlement.';

create or replace function public.refresh_weekly_callup_paid_roster(
  p_callup_id uuid,
  p_snapshot_at timestamptz,
  p_players jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_callup public.weekly_callups%rowtype;
  v_player jsonb;
  v_category_id uuid;
  v_existing_player_id uuid;
  v_added int := 0;
  v_removed int := 0;
  v_moved int := 0;
  v_manual int := 0;
begin
  select * into v_callup
  from public.weekly_callups
  where id = p_callup_id
  for update;

  if v_callup.id is null then
    raise exception 'weekly_callup_not_found';
  end if;

  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array' then
    raise exception 'weekly_callup_invalid_roster';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) desired
    group by desired->>'enrollment_id'
    having count(*) > 1
  ) then
    raise exception 'weekly_callup_duplicate_roster_player';
  end if;

  select count(*) into v_added
  from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) desired
  where not exists (
    select 1
    from public.weekly_callup_players player
    join public.weekly_callup_categories category on category.id = player.weekly_callup_category_id
    where category.weekly_callup_id = p_callup_id
      and player.enrollment_id = (desired->>'enrollment_id')::uuid
  );

  select count(*) into v_removed
  from public.weekly_callup_players player
  join public.weekly_callup_categories category on category.id = player.weekly_callup_category_id
  where category.weekly_callup_id = p_callup_id
    and player.eligibility_source <> 'manual_unpaid'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) desired
      where (desired->>'enrollment_id')::uuid = player.enrollment_id
    );

  select count(*) into v_moved
  from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) desired
  join public.weekly_callup_players player on player.enrollment_id = (desired->>'enrollment_id')::uuid
  join public.weekly_callup_categories category on category.id = player.weekly_callup_category_id
  where category.weekly_callup_id = p_callup_id
    and player.training_group_id is distinct from (desired->>'training_group_id')::uuid;

  select count(*) into v_manual
  from public.weekly_callup_players player
  join public.weekly_callup_categories category on category.id = player.weekly_callup_category_id
  where category.weekly_callup_id = p_callup_id
    and player.eligibility_source = 'manual_unpaid';

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    v_category_id := null;
    v_existing_player_id := null;

    if coalesce(v_player->>'eligibility_source', '') not in ('direct', 'bundle') then
      raise exception 'weekly_callup_invalid_eligibility_source';
    end if;

    if not exists (
      select 1
      from public.enrollments enrollment
      join public.players player on player.id = enrollment.player_id
      join public.training_groups training_group on training_group.id = (v_player->>'training_group_id')::uuid
      where enrollment.id = (v_player->>'enrollment_id')::uuid
        and enrollment.player_id = (v_player->>'player_id')::uuid
        and enrollment.campus_id = v_callup.campus_id
        and enrollment.status = 'active'
        and player.status = 'active'
        and training_group.campus_id = v_callup.campus_id
        and training_group.program = v_callup.program
        and training_group.status = 'active'
    ) then
      raise exception 'weekly_callup_invalid_roster_player';
    end if;

    select id into v_category_id
    from public.weekly_callup_categories
    where weekly_callup_id = p_callup_id
      and training_group_id = (v_player->>'training_group_id')::uuid;

    if v_category_id is null then
      insert into public.weekly_callup_categories (
        weekly_callup_id,
        training_group_id,
        category_label,
        birth_year_min,
        birth_year_max,
        training_group_name_snapshot,
        sort_order
      ) values (
        p_callup_id,
        (v_player->>'training_group_id')::uuid,
        v_player->>'category_label',
        nullif(v_player->>'birth_year_min', '')::int,
        nullif(v_player->>'birth_year_max', '')::int,
        v_player->>'training_group_name',
        coalesce((select max(sort_order) + 1 from public.weekly_callup_categories where weekly_callup_id = p_callup_id), 0)
      ) returning id into v_category_id;
    end if;

    select player.id into v_existing_player_id
    from public.weekly_callup_players player
    join public.weekly_callup_categories category on category.id = player.weekly_callup_category_id
    where category.weekly_callup_id = p_callup_id
      and player.enrollment_id = (v_player->>'enrollment_id')::uuid
    order by player.created_at
    limit 1;

    if v_existing_player_id is null then
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
      ) values (
        v_category_id,
        (v_player->>'enrollment_id')::uuid,
        (v_player->>'player_id')::uuid,
        v_player->>'player_name',
        nullif(v_player->>'birth_year', '')::int,
        (v_player->>'training_group_id')::uuid,
        v_player->>'training_group_name',
        v_player->>'eligibility_source',
        'included',
        p_snapshot_at
      );
    else
      update public.weekly_callup_players
      set weekly_callup_category_id = v_category_id,
          player_id = (v_player->>'player_id')::uuid,
          player_name_snapshot = v_player->>'player_name',
          birth_year = nullif(v_player->>'birth_year', '')::int,
          training_group_id = (v_player->>'training_group_id')::uuid,
          training_group_name_snapshot = v_player->>'training_group_name',
          eligibility_source = v_player->>'eligibility_source',
          manual_reason = null,
          source_snapshot_at = p_snapshot_at,
          updated_at = p_snapshot_at
      where id = v_existing_player_id;
    end if;
  end loop;

  delete from public.weekly_callup_players player
  using public.weekly_callup_categories category
  where category.id = player.weekly_callup_category_id
    and category.weekly_callup_id = p_callup_id
    and player.eligibility_source <> 'manual_unpaid'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) desired
      where (desired->>'enrollment_id')::uuid = player.enrollment_id
    );

  update public.weekly_callups
  set roster_snapshot_at = p_snapshot_at,
      status = 'draft',
      updated_by = p_actor_id,
      updated_at = p_snapshot_at
  where id = p_callup_id;

  return jsonb_build_object(
    'current_paid_players', jsonb_array_length(coalesce(p_players, '[]'::jsonb)),
    'added_players', v_added,
    'removed_players', v_removed,
    'moved_players', v_moved,
    'manual_exceptions_preserved', v_manual
  );
end;
$$;

revoke all on function public.refresh_weekly_callup_paid_roster(uuid, timestamptz, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_weekly_callup_paid_roster(uuid, timestamptz, jsonb, uuid)
  to service_role;
