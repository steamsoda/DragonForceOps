-- Seed all reference data needed in production.
-- Safe to run on any environment — fully idempotent.
-- Covers: pricing plan, tuition rules, pricing plan items.
-- (campuses, charge_types, app_roles were seeded in phase1_core and are already present.)

DO $$
DECLARE
  plan_id                  uuid;
  ct_inscription_id        uuid;
  ct_uniform_training_id   uuid;
  ct_uniform_game_id       uuid;
BEGIN

  -- ── Pricing plan ────────────────────────────────────────────────────────────
  SELECT id INTO plan_id
    FROM public.pricing_plans
    WHERE name = 'Plan Mensual' AND is_active = true
    LIMIT 1;

  IF plan_id IS NULL THEN
    INSERT INTO public.pricing_plans (name, currency, is_active)
    VALUES ('Plan Mensual', 'MXN', true)
    RETURNING id INTO plan_id;
    RAISE NOTICE 'Created Plan Mensual: %', plan_id;
  ELSE
    RAISE NOTICE 'Plan Mensual already exists: %', plan_id;
  END IF;

  -- ── Tuition rules (2-tier) ───────────────────────────────────────────────────
  -- Days  1–10 → $600 early-bird
  -- Days 11+   → $750 regular
  DELETE FROM public.pricing_plan_tuition_rules WHERE pricing_plan_id = plan_id;

  INSERT INTO public.pricing_plan_tuition_rules
    (pricing_plan_id, day_from, day_to, amount, priority)
  VALUES
    (plan_id, 1,  10,   600, 1),
    (plan_id, 11, null, 750, 2);

  RAISE NOTICE 'Tuition rules seeded for plan %', plan_id;

  -- ── Pricing plan items ───────────────────────────────────────────────────────
  SELECT id INTO ct_inscription_id
    FROM public.charge_types WHERE code = 'inscription' LIMIT 1;
  SELECT id INTO ct_uniform_training_id
    FROM public.charge_types WHERE code = 'uniform_training' LIMIT 1;
  SELECT id INTO ct_uniform_game_id
    FROM public.charge_types WHERE code = 'uniform_game' LIMIT 1;

  -- inscription: $1,800 (includes 2 training kits)
  INSERT INTO public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  VALUES (plan_id, ct_inscription_id, 1800)
  ON CONFLICT (pricing_plan_id, charge_type_id)
    DO UPDATE SET amount = excluded.amount, updated_at = now();

  -- uniform_training: $600 (extra kit, ad-hoc)
  INSERT INTO public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  VALUES (plan_id, ct_uniform_training_id, 600)
  ON CONFLICT (pricing_plan_id, charge_type_id)
    DO UPDATE SET amount = excluded.amount, updated_at = now();

  -- uniform_game: $600 (game kit, ad-hoc)
  INSERT INTO public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  VALUES (plan_id, ct_uniform_game_id, 600)
  ON CONFLICT (pricing_plan_id, charge_type_id)
    DO UPDATE SET amount = excluded.amount, updated_at = now();

  RAISE NOTICE 'Pricing plan items seeded.';

END $$;
