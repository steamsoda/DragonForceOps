-- Correct pricing data to match confirmed business rules.
-- Replaces ChatGPT-generated placeholder data with real values.
--
-- Changes:
--   pricing_plans      → rename "Plan Mensual Basico" → "Plan Mensual"; deactivate "Plan Mensual Avanzado"
--   pricing_plan_tuition_rules → replace 3-tier placeholders with 2 real tiers:
--                                days 1–10 = $600 (early bird), days 11+ = $750 (regular)
--   pricing_plan_items → correct amounts: inscription $1,800 | uniform_training $600 | uniform_game $600
--                        remove Plan Avanzado items (plan is deactivated)

do $$
declare
  plan_basico_id   uuid;
  plan_avanzado_id uuid;
  ct_inscription_id       uuid;
  ct_uniform_training_id  uuid;
  ct_uniform_game_id      uuid;
begin

  -- ── Pricing plans ────────────────────────────────────────────────────────

  select id into plan_basico_id
    from public.pricing_plans where name = 'Plan Mensual Basico' limit 1;

  select id into plan_avanzado_id
    from public.pricing_plans where name = 'Plan Mensual Avanzado' limit 1;

  -- Rename the single real plan
  if plan_basico_id is not null then
    update public.pricing_plans
      set name = 'Plan Mensual', updated_at = now()
      where id = plan_basico_id;
  end if;

  -- Deactivate the placeholder "Avanzado" plan (no enrollments should reference it in prod)
  if plan_avanzado_id is not null then
    update public.pricing_plans
      set is_active = false, updated_at = now()
      where id = plan_avanzado_id;
  end if;

  -- ── Tuition rules ─────────────────────────────────────────────────────────
  -- Replace all placeholder rules with the real 2-tier structure.
  -- Monthly charge is created at the regular rate ($750).
  -- At payment time the server applies a -$150 discount credit line for early-bird payments (days 1-10).

  if plan_basico_id is not null then
    -- Drop old placeholder rules
    delete from public.pricing_plan_tuition_rules
      where pricing_plan_id = plan_basico_id;

    -- Insert real 2-tier rules
    insert into public.pricing_plan_tuition_rules
      (pricing_plan_id, day_from, day_to, amount, priority)
    values
      (plan_basico_id, 1,  10,   600, 1),  -- early bird
      (plan_basico_id, 11, null, 750, 2);  -- regular (no end = day 11 onward)
  end if;

  if plan_avanzado_id is not null then
    delete from public.pricing_plan_tuition_rules
      where pricing_plan_id = plan_avanzado_id;
  end if;

  -- ── pricing_plan_items ───────────────────────────────────────────────────

  select id into ct_inscription_id
    from public.charge_types where code = 'inscription' limit 1;
  select id into ct_uniform_training_id
    from public.charge_types where code = 'uniform_training' limit 1;
  select id into ct_uniform_game_id
    from public.charge_types where code = 'uniform_game' limit 1;

  -- Correct Plan Mensual items
  if plan_basico_id is not null then
    -- inscription: $1,800 (all-inclusive — includes 2 training kits at enrollment)
    insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
    values (plan_basico_id, ct_inscription_id, 1800)
    on conflict (pricing_plan_id, charge_type_id)
      do update set amount = excluded.amount, updated_at = now();

    -- uniform_training: $600 (used for extra kit only, ad-hoc — not at enrollment by default)
    insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
    values (plan_basico_id, ct_uniform_training_id, 600)
    on conflict (pricing_plan_id, charge_type_id)
      do update set amount = excluded.amount, updated_at = now();

    -- uniform_game: $600 (ad-hoc, when player receives game kit)
    insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
    values (plan_basico_id, ct_uniform_game_id, 600)
    on conflict (pricing_plan_id, charge_type_id)
      do update set amount = excluded.amount, updated_at = now();
  end if;

  -- Remove Plan Avanzado items (plan is deactivated; orphaned rows serve no purpose)
  if plan_avanzado_id is not null then
    delete from public.pricing_plan_items
      where pricing_plan_id = plan_avanzado_id;
  end if;

end $$;
