-- Keep active tournament metadata and the final Caja pricing window aligned.
-- Earlier pricing tiers, amounts, eligibility dimensions, and historical rows
-- remain unchanged.

create or replace function public.save_sports_signup_tournament_settings(
  p_actor_user_id uuid,
  p_product_id uuid,
  p_campus_ids uuid[],
  p_all_campuses boolean,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_signup_deadline date,
  p_caja_available_until date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product_name text;
  v_rule_count integer := 0;
  v_pricing_rule_ids uuid[] := array[]::uuid[];
  v_pricing_rules_updated integer := 0;
  v_tournament_id uuid;
  v_tournament_ids uuid[] := array[]::uuid[];
  v_campus_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = p_actor_user_id
      and ar.code = 'superadmin'
  ) then
    raise exception 'superadmin_required';
  end if;

  if coalesce(cardinality(p_campus_ids), 0) = 0
    or exists (
      select 1
      from unnest(p_campus_ids) requested(id)
      left join public.campuses campus on campus.id = requested.id
      where campus.id is null
    ) then
    raise exception 'invalid_tournament_settings';
  end if;

  select product.name
  into v_product_name
  from public.products product
  join public.charge_types charge_type on charge_type.id = product.charge_type_id
  where product.id = p_product_id
    and product.is_active = true
    and charge_type.code in ('tournament', 'cup', 'league');

  if not found then
    raise exception 'invalid_tournament_product';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'invalid_tournament_dates';
  end if;

  if p_signup_deadline is not null
    and p_caja_available_until is not null
    and p_caja_available_until < p_signup_deadline then
    raise exception 'caja_before_signup_deadline';
  end if;

  select count(*)
  into v_rule_count
  from public.product_pricing_rules pricing_rule
  where pricing_rule.product_id = p_product_id;

  if v_rule_count > 0 then
    if p_caja_available_until is null then
      raise exception 'caja_availability_required';
    end if;

    if not p_all_campuses and exists (
      select 1
      from public.product_pricing_rules pricing_rule
      where pricing_rule.product_id = p_product_id
        and pricing_rule.campus_id is null
    ) then
      raise exception 'global_pricing_requires_all_campuses';
    end if;

    if exists (
      select 1
      from unnest(p_campus_ids) requested(id)
      where not exists (
        select 1
        from public.product_pricing_rules pricing_rule
        where pricing_rule.product_id = p_product_id
          and (pricing_rule.campus_id = requested.id or pricing_rule.campus_id is null)
      )
    ) then
      raise exception 'pricing_rules_missing_for_campus';
    end if;

    select coalesce(array_agg(ranked.id), array[]::uuid[])
    into v_pricing_rule_ids
    from (
      select
        pricing_rule.id,
        row_number() over (
          partition by
            pricing_rule.campus_id,
            pricing_rule.training_program,
            pricing_rule.gender,
            pricing_rule.birth_year_min,
            pricing_rule.birth_year_max,
            pricing_rule.required_paid_product_id,
            pricing_rule.priority
          order by
            pricing_rule.ends_on desc nulls first,
            pricing_rule.starts_on desc,
            pricing_rule.id
        ) as terminal_rank
      from public.product_pricing_rules pricing_rule
      where pricing_rule.product_id = p_product_id
        and (
          pricing_rule.campus_id = any(p_campus_ids)
          or (p_all_campuses and pricing_rule.campus_id is null)
        )
    ) ranked
    where ranked.terminal_rank = 1;

    if cardinality(v_pricing_rule_ids) = 0 then
      raise exception 'pricing_rules_missing_for_campus';
    end if;

    if exists (
      select 1
      from public.product_pricing_rules pricing_rule
      where pricing_rule.id = any(v_pricing_rule_ids)
        and pricing_rule.starts_on > p_caja_available_until
    ) then
      raise exception 'caja_before_final_pricing_tier';
    end if;

    update public.product_pricing_rules pricing_rule
    set ends_on = p_caja_available_until
    where pricing_rule.id = any(v_pricing_rule_ids)
      and pricing_rule.ends_on is distinct from p_caja_available_until;

    get diagnostics v_pricing_rules_updated = row_count;
  end if;

  foreach v_campus_id in array p_campus_ids loop
    select tournament.id
    into v_tournament_id
    from public.tournaments tournament
    where tournament.product_id = p_product_id
      and tournament.campus_id = v_campus_id
      and tournament.is_active = true
    for update;

    if found then
      update public.tournaments
      set name = coalesce(nullif(btrim(p_name), ''), v_product_name),
          start_date = p_start_date,
          end_date = p_end_date,
          signup_deadline = p_signup_deadline,
          updated_at = now()
      where id = v_tournament_id;
    else
      insert into public.tournaments (
        name,
        campus_id,
        product_id,
        gender,
        start_date,
        end_date,
        signup_deadline,
        is_active,
        is_mandatory,
        created_by,
        updated_at
      ) values (
        coalesce(nullif(btrim(p_name), ''), v_product_name),
        v_campus_id,
        p_product_id,
        'mixed',
        p_start_date,
        p_end_date,
        p_signup_deadline,
        true,
        false,
        p_actor_user_id,
        now()
      )
      returning id into v_tournament_id;
    end if;

    v_tournament_ids := array_append(v_tournament_ids, v_tournament_id);
  end loop;

  return jsonb_build_object(
    'tournament_ids', to_jsonb(v_tournament_ids),
    'pricing_rule_count', v_rule_count,
    'pricing_rules_updated', v_pricing_rules_updated,
    'caja_available_until', p_caja_available_until
  );
end;
$$;

revoke all on function public.save_sports_signup_tournament_settings(
  uuid, uuid, uuid[], boolean, text, date, date, date, date
) from public, anon, authenticated;
grant execute on function public.save_sports_signup_tournament_settings(
  uuid, uuid, uuid[], boolean, text, date, date, date, date
) to service_role;

comment on function public.save_sports_signup_tournament_settings(
  uuid, uuid, uuid[], boolean, text, date, date, date, date
) is
  'Super Admin atomic editor for active tournament dates and terminal Caja pricing windows. Preserves amounts, eligibility, prior tiers, charges, payments, and registrations.';
