-- Replaces the preview-applied Pass 1 function with a post-lock duplicate check.
-- Fresh databases already receive the same behavior from the preceding migration.

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
