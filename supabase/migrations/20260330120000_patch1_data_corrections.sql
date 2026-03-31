-- ============================================================
-- Patch 1 - Data Corrections
-- Applied: 2026-03-30
-- Source: docs/Reference Docs/Patches/Patch 1/
-- 69 total DB actions across 5 sheets
--
-- IMPORTANT:
-- This migration now acts as a recovery-safe, idempotent Patch 1 pass.
-- Prod was found in a partially-applied state, so the duplicate cleanup
-- below is guarded to preserve only the intended master records.
-- ============================================================


-- ============================================================
-- SECTION 1: DATA CORRECTIONS (11 records)
-- Simple UPDATE players SET field = value WHERE id = uuid
-- ============================================================

-- DF-0672: first_name 'Santiagoo' -> 'Santiago' (double O typo)
UPDATE public.players
SET first_name = 'Santiago', updated_at = now()
WHERE id = '2ab012cd-ece1-49ed-bd46-5fac6b4a80eb'
  AND first_name IS DISTINCT FROM 'Santiago';

-- DF-0653: last_name 'A Gaytanluna' -> 'A Gaytan Luna' (compound surname)
UPDATE public.players
SET last_name = 'A Gaytan Luna', updated_at = now()
WHERE id = '016822c4-1361-4b75-9440-968806938095'
  AND last_name IS DISTINCT FROM 'A Gaytan Luna';

-- DF-0645: last_name 'Lozano Garcia' -> 'Lozano García' (accent)
UPDATE public.players
SET last_name = 'Lozano García', updated_at = now()
WHERE id = 'f9a173e9-758a-4e98-872c-a98ca58d3f70'
  AND last_name IS DISTINCT FROM 'Lozano García';

-- DF-0373: birth_date 2010-01-01 -> 2012-01-01 (parents entered wrong year)
UPDATE public.players
SET birth_date = '2012-01-01', updated_at = now()
WHERE id = '31795952-1e84-4bf0-b8d9-fc51e2528fff'
  AND birth_date IS DISTINCT FROM '2012-01-01';

-- DF-0476: last_name -> 'Guzmán Ramírez' (abbreviated in seed)
UPDATE public.players
SET last_name = 'Guzmán Ramírez', updated_at = now()
WHERE id = '865dd7a1-7057-4f93-bf6e-9cd9ff78e752'
  AND last_name IS DISTINCT FROM 'Guzmán Ramírez';

-- DF-0185: last_name 'Fdz Harsany' -> 'Fernández Harsanyi' (abbreviated)
UPDATE public.players
SET last_name = 'Fernández Harsanyi', updated_at = now()
WHERE id = '58259855-4bfe-4b74-b364-8edfb31bd01b'
  AND last_name IS DISTINCT FROM 'Fernández Harsanyi';

-- DF-0151: last_name 'Alvarez Rdz' -> 'Álvarez Rodríguez' (abbreviated)
UPDATE public.players
SET last_name = 'Álvarez Rodríguez', updated_at = now()
WHERE id = 'a167bacc-791c-432b-879e-ad726177f174'
  AND last_name IS DISTINCT FROM 'Álvarez Rodríguez';

-- DF-0165: last_name 'Garcia Gzz' -> 'García González' (abbreviated)
UPDATE public.players
SET last_name = 'García González', updated_at = now()
WHERE id = '052f3916-761a-46c2-8934-e527d76bb1a8'
  AND last_name IS DISTINCT FROM 'García González';

-- DF-0109: last_name 'Montelongo Mtz' -> 'Montelongo Martínez' (abbreviated)
UPDATE public.players
SET last_name = 'Montelongo Martínez', updated_at = now()
WHERE id = 'fb9fb9c2-4ac1-46e5-82bf-d8f9e25a3026'
  AND last_name IS DISTINCT FROM 'Montelongo Martínez';

-- DF-0100: birth_date 1977-01-01 -> 2013-01-01 (staff data entry error)
UPDATE public.players
SET birth_date = '2013-01-01', updated_at = now()
WHERE id = 'f3915c37-d754-4701-bd29-0a21d138ef5a'
  AND birth_date IS DISTINCT FROM '2013-01-01';

-- DF-0631: last_name 'Crucciani Molina' -> 'Cruciani Molina' (confirmed spelling)
UPDATE public.players
SET last_name = 'Cruciani Molina', updated_at = now()
WHERE id = 'e4d97862-5dc5-483a-b12a-274f8d169f3f'
  AND last_name IS DISTINCT FROM 'Cruciani Molina';


-- ============================================================
-- SECTION 2: DUPLICATE RESOLUTION (3 real duplicates)
-- Guarded duplicate cleanup:
--   - keep the known master record
--   - move any guardians onto the master
--   - delete the duplicate and its duplicate financial history
--   - fail if the duplicate and master have diverged unexpectedly
-- ============================================================

-- DF-0170 (ADAM RODRIGUEZ TRASHHORRAS): keep DF-0171, delete DF-0170 (double-H typo)
DO $$
DECLARE
  v_del uuid := '937560db-be3e-4b2a-82ec-dc6efe9579fc';
  v_keep uuid := 'e3515170-e6e9-416d-a7e6-d7a63d7f1031';
  v_del_enrollment uuid;
  v_keep_enrollment uuid;
  v_del_start date;
  v_keep_start date;
  v_del_campus uuid;
  v_keep_campus uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_del) THEN
    RAISE NOTICE 'Patch1: DF-0170 already resolved';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_keep) THEN
      RAISE EXCEPTION 'Patch1: DF-0171 master record is missing';
    END IF;

    SELECT id, start_date, campus_id
    INTO v_del_enrollment, v_del_start, v_del_campus
    FROM public.enrollments
    WHERE player_id = v_del AND status = 'active'
    LIMIT 1;

    SELECT id, start_date, campus_id
    INTO v_keep_enrollment, v_keep_start, v_keep_campus
    FROM public.enrollments
    WHERE player_id = v_keep AND status = 'active'
    LIMIT 1;

    IF v_del_enrollment IS NULL OR v_keep_enrollment IS NULL THEN
      RAISE EXCEPTION 'Patch1: DF-0170/DF-0171 expected active enrollments are missing';
    END IF;

    IF v_del_start IS DISTINCT FROM v_keep_start
       OR v_del_campus IS DISTINCT FROM v_keep_campus THEN
      RAISE EXCEPTION 'Patch1: DF-0170/DF-0171 enrollments diverged unexpectedly';
    END IF;

    INSERT INTO public.player_guardians (player_id, guardian_id, is_primary)
    SELECT v_keep, pg.guardian_id, pg.is_primary
    FROM public.player_guardians pg
    WHERE pg.player_id = v_del
    ON CONFLICT (player_id, guardian_id) DO NOTHING;

    PERFORM public.nuke_player(v_del);
    RAISE NOTICE 'Patch1: DF-0170 duplicate removed safely';
  END IF;
END $$;

-- DF-0574 (ABRAHAM ISRAEL ELIZONDO ELIZONDO): keep DF-0575, delete DF-0574 (wrong last name)
-- Note: MZO payment for DF-0575 is handled in Section 5 (stripe_360player, March 1, $600)
DO $$
DECLARE
  v_del uuid := '08a2226c-42ce-4b5e-be1b-c62eeb75fb1f';
  v_keep uuid := '36a04bc4-d63e-4233-b7f0-12157fb25cca';
  v_del_enrollment uuid;
  v_keep_enrollment uuid;
  v_del_start date;
  v_keep_start date;
  v_del_campus uuid;
  v_keep_campus uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_del) THEN
    RAISE NOTICE 'Patch1: DF-0574 already resolved';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_keep) THEN
      RAISE EXCEPTION 'Patch1: DF-0575 master record is missing';
    END IF;

    SELECT id, start_date, campus_id
    INTO v_del_enrollment, v_del_start, v_del_campus
    FROM public.enrollments
    WHERE player_id = v_del AND status = 'active'
    LIMIT 1;

    SELECT id, start_date, campus_id
    INTO v_keep_enrollment, v_keep_start, v_keep_campus
    FROM public.enrollments
    WHERE player_id = v_keep AND status = 'active'
    LIMIT 1;

    IF v_del_enrollment IS NULL OR v_keep_enrollment IS NULL THEN
      RAISE EXCEPTION 'Patch1: DF-0574/DF-0575 expected active enrollments are missing';
    END IF;

    IF v_del_start IS DISTINCT FROM v_keep_start
       OR v_del_campus IS DISTINCT FROM v_keep_campus THEN
      RAISE EXCEPTION 'Patch1: DF-0574/DF-0575 enrollments diverged unexpectedly';
    END IF;

    INSERT INTO public.player_guardians (player_id, guardian_id, is_primary)
    SELECT v_keep, pg.guardian_id, pg.is_primary
    FROM public.player_guardians pg
    WHERE pg.player_id = v_del
    ON CONFLICT (player_id, guardian_id) DO NOTHING;

    PERFORM public.nuke_player(v_del);
    RAISE NOTICE 'Patch1: DF-0574 duplicate removed safely';
  END IF;
END $$;

-- DF-0527 (SEBASTIAN GUZMAN RDZ born 2015): keep DF-0476 (born 2014, real record), delete DF-0527
DO $$
DECLARE
  v_del uuid := 'cc1b4b42-ecca-4045-8fe7-d3d671409fb3';
  v_keep uuid := '865dd7a1-7057-4f93-bf6e-9cd9ff78e752';
  v_del_enrollment uuid;
  v_keep_enrollment uuid;
  v_del_start date;
  v_keep_start date;
  v_del_campus uuid;
  v_keep_campus uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_del) THEN
    RAISE NOTICE 'Patch1: DF-0527 already resolved';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_keep) THEN
      RAISE EXCEPTION 'Patch1: DF-0476 master record is missing';
    END IF;

    SELECT id, start_date, campus_id
    INTO v_del_enrollment, v_del_start, v_del_campus
    FROM public.enrollments
    WHERE player_id = v_del AND status = 'active'
    LIMIT 1;

    SELECT id, start_date, campus_id
    INTO v_keep_enrollment, v_keep_start, v_keep_campus
    FROM public.enrollments
    WHERE player_id = v_keep AND status = 'active'
    LIMIT 1;

    IF v_del_enrollment IS NULL OR v_keep_enrollment IS NULL THEN
      RAISE EXCEPTION 'Patch1: DF-0527/DF-0476 expected active enrollments are missing';
    END IF;

    IF v_del_start IS DISTINCT FROM v_keep_start
       OR v_del_campus IS DISTINCT FROM v_keep_campus THEN
      RAISE EXCEPTION 'Patch1: DF-0527/DF-0476 enrollments diverged unexpectedly';
    END IF;

    INSERT INTO public.player_guardians (player_id, guardian_id, is_primary)
    SELECT v_keep, pg.guardian_id, pg.is_primary
    FROM public.player_guardians pg
    WHERE pg.player_id = v_del
    ON CONFLICT (player_id, guardian_id) DO NOTHING;

    PERFORM public.nuke_player(v_del);
    RAISE NOTICE 'Patch1: DF-0527 duplicate removed safely';
  END IF;
END $$;


-- ============================================================
-- SECTION 3: BAJAS (4 enrollment ends, dropout_reason = 'other')
-- ============================================================

-- DF-0668 (LUIS CARLOS LOPEZ HILARIO, LV 2021)
UPDATE public.enrollments
SET status = 'ended', dropout_reason = 'other', end_date = '2026-03-30', updated_at = now()
WHERE player_id = 'e42e36b5-d2fc-4953-ba5b-1f73268d68e8' AND status = 'active';

-- DF-0199 (GIOVANNI ALEXANDER REYES G, Contry 2017)
UPDATE public.enrollments
SET status = 'ended', dropout_reason = 'other', end_date = '2026-03-30', updated_at = now()
WHERE player_id = '0b454710-0ca4-4df7-89e5-0397a839b501' AND status = 'active';

-- DF-0204 (LEON ALANIS JIMENEZ, Contry 2017)
UPDATE public.enrollments
SET status = 'ended', dropout_reason = 'other', end_date = '2026-03-30', updated_at = now()
WHERE player_id = 'ed5f1fb6-5705-4142-b542-b21df50aa6eb' AND status = 'active';

-- Gerardo Damian Selva Rocha (Contry 2022, no DF code - lookup by name)
UPDATE public.enrollments
SET status = 'ended', dropout_reason = 'other', end_date = '2026-03-30', updated_at = now()
WHERE player_id = (
  SELECT id FROM public.players
  WHERE first_name ILIKE 'Gerardo%' AND last_name ILIKE '%Selva%'
  LIMIT 1
) AND status = 'active';


-- ============================================================
-- SECTION 4: NEW PLAYERS (2 of 6 - Mitre brothers)
-- Alessandro and Leonardo Mitre Gomez, Contry, enrolled 2026-03-27.
-- No guardian data - collect at desk.
-- Other 4 new players deferred: create via app once dates confirmed.
-- birth_date uses Jan 1 as placeholder; staff can correct via app.
-- ============================================================

DO $$
DECLARE
  v_player_id    uuid;
  v_enroll_id    uuid;
  v_campus_id    uuid;
  v_plan_id      uuid;
  v_ins_type_id  uuid;
  v_tui_type_id  uuid;
BEGIN
  SELECT id INTO v_campus_id FROM public.campuses WHERE code = 'CONTRY';
  SELECT id INTO v_plan_id   FROM public.pricing_plans ORDER BY created_at LIMIT 1;
  SELECT id INTO v_ins_type_id FROM public.charge_types WHERE code = 'inscription';
  SELECT id INTO v_tui_type_id FROM public.charge_types WHERE code = 'monthly_tuition';

  -- Alessandro Mitre Gomez, born 2017 (placeholder Jan 1)
  SELECT id
  INTO v_player_id
  FROM public.players
  WHERE first_name = 'Alessandro'
    AND last_name = 'Mitre Gomez'
    AND birth_date = '2017-01-01'
  LIMIT 1;

  IF v_player_id IS NULL THEN
    INSERT INTO public.players (first_name, last_name, birth_date, gender, status)
    VALUES ('Alessandro', 'Mitre Gomez', '2017-01-01', 'male', 'active')
    RETURNING id INTO v_player_id;

    INSERT INTO public.enrollments (player_id, campus_id, pricing_plan_id, status, start_date, inscription_date)
    VALUES (v_player_id, v_campus_id, v_plan_id, 'active', '2026-03-27', '2026-03-27')
    RETURNING id INTO v_enroll_id;

    INSERT INTO public.charges (enrollment_id, charge_type_id, description, amount, currency, status, period_month, due_date)
    VALUES
      (v_enroll_id, v_ins_type_id, 'Inscripción', 1800, 'MXN', 'pending', NULL, '2026-03-27'),
      (v_enroll_id, v_tui_type_id, 'Mensualidad Marzo 2026', 600, 'MXN', 'pending', '2026-03-01', '2026-03-27');

    RAISE NOTICE 'Patch1: inserted Alessandro Mitre Gomez, player_id=%', v_player_id;
  ELSE
    RAISE NOTICE 'Patch1: Alessandro Mitre Gomez already exists, skipping insert';
  END IF;

  -- Leonardo Mitre Gomez, born 2015 (placeholder Jan 1)
  SELECT id
  INTO v_player_id
  FROM public.players
  WHERE first_name = 'Leonardo'
    AND last_name = 'Mitre Gomez'
    AND birth_date = '2015-01-01'
  LIMIT 1;

  IF v_player_id IS NULL THEN
    INSERT INTO public.players (first_name, last_name, birth_date, gender, status)
    VALUES ('Leonardo', 'Mitre Gomez', '2015-01-01', 'male', 'active')
    RETURNING id INTO v_player_id;

    INSERT INTO public.enrollments (player_id, campus_id, pricing_plan_id, status, start_date, inscription_date)
    VALUES (v_player_id, v_campus_id, v_plan_id, 'active', '2026-03-27', '2026-03-27')
    RETURNING id INTO v_enroll_id;

    INSERT INTO public.charges (enrollment_id, charge_type_id, description, amount, currency, status, period_month, due_date)
    VALUES
      (v_enroll_id, v_ins_type_id, 'Inscripción', 1800, 'MXN', 'pending', NULL, '2026-03-27'),
      (v_enroll_id, v_tui_type_id, 'Mensualidad Marzo 2026', 600, 'MXN', 'pending', '2026-03-01', '2026-03-27');

    RAISE NOTICE 'Patch1: inserted Leonardo Mitre Gomez, player_id=%', v_player_id;
  ELSE
    RAISE NOTICE 'Patch1: Leonardo Mitre Gomez already exists, skipping insert';
  END IF;
END $$;


-- ============================================================
-- SECTION 5: PAYMENT BACKFILL (45 payments)
--
-- Logic per payment:
--   1. Find active enrollment for player
--   2. Find existing MZO/FEB monthly_tuition charge, or create it at $750
--   3. Early bird (is_early_bird=true AND enrollment not from same month):
--      UPDATE charges.amount = 600
--   4. Idempotency: skip if charge already has a posted payment allocation
--   5. INSERT payment + INSERT payment_allocation
--
-- paid_at = noon Monterrey (UTC-6) = 18:00 UTC
-- created_by = NULL (nullable per migration 20260311130000)
-- ============================================================

-- Special pre-step: DF-0246 - update to 'cash' if a stripe payment already exists for MZO
UPDATE public.payments
SET method = 'cash', updated_at = now()
WHERE enrollment_id = (
  SELECT id FROM public.enrollments
  WHERE player_id = '498706e9-8848-4280-9453-978ff7ab901c'
    AND status = 'active'
)
AND paid_at >= '2026-03-01 06:00:00+00'
AND paid_at <  '2026-04-01 06:00:00+00'
AND method = 'stripe_360player'
AND status != 'void';

-- Main payment loop - all 45 payments
DO $$
DECLARE
  r                RECORD;
  v_enroll_id      uuid;
  v_enroll_start   date;
  v_charge_id      uuid;
  v_pay_id         uuid;
  v_charge_type_id uuid;
BEGIN
  SELECT id INTO v_charge_type_id FROM public.charge_types WHERE code = 'monthly_tuition';

  FOR r IN
    SELECT
      player_id::uuid,
      method::public.payment_method,
      paid_at::timestamptz,
      amount::numeric,
      period::date,
      is_early_bird::boolean
    FROM (VALUES
      -- CASH PAYMENTS
      -- DF-0435 FEB  (Mateo Fernandez Davila - Feb tuition paid at desk March 18)
      ('98b8ca6a-0e4b-4d18-a76d-f32b25a0defd','cash','2026-03-18 18:00:00+00',750,'2026-02-01',false),
      -- DF-0435 MZO  (same visit, March tuition)
      ('98b8ca6a-0e4b-4d18-a76d-f32b25a0defd','cash','2026-03-18 18:00:00+00',750,'2026-03-01',false),
      -- DF-0320 MZO  LV 2012 - March 9 (early bird day 9)
      ('53e172e3-3d50-427f-86cb-f052d4de5dd4','cash','2026-03-09 18:00:00+00',600,'2026-03-01',true),
      -- DF-0389 MZO  LV 2012 - March 9 (early bird day 9, confirmed both paid)
      ('c926df86-103a-439b-80ff-39599de4bcd2','cash','2026-03-09 18:00:00+00',600,'2026-03-01',true),
      -- DF-0568 MZO  LV 2016 - March 17
      ('9dc9dd65-9bd0-46df-a8a5-8b91eec945ee','cash','2026-03-17 18:00:00+00',750,'2026-03-01',false),
      -- DF-0317 MZO  LV 2011 - March 18
      ('a757f375-6ca8-4b34-821e-f612369fb4c1','cash','2026-03-18 18:00:00+00',750,'2026-03-01',false),
      -- DF-0277 MZO  LV 2010 - March 18
      ('39fe43f3-b11a-4a4b-9619-2e88a98bfda4','cash','2026-03-18 18:00:00+00',750,'2026-03-01',false),
      -- DF-0286 MZO  LV 2010 - March 10 (early bird day 10)
      ('093319d1-6893-429d-937c-fd436c9d4714','cash','2026-03-10 18:00:00+00',600,'2026-03-01',true),
      -- DF-0266 MZO  LV 2009 - March 18
      ('07acafdc-b94e-422c-8956-65a2296e2fd8','cash','2026-03-18 18:00:00+00',750,'2026-03-01',false),
      -- DF-0490 MZO  LV FEM 2015 - March 17
      ('9a90b4f0-4da4-40e0-9bd0-8f9caef0429b','cash','2026-03-17 18:00:00+00',750,'2026-03-01',false),
      -- DF-0274 MZO  LV FEM 2009 - March 18
      ('0d404471-1718-4ba5-b683-05bd24fbcead','cash','2026-03-18 18:00:00+00',750,'2026-03-01',false),
      -- DF-0114 MZO  Contry 2014 - March 2 (early bird day 2)
      ('d9f91ea1-6bc6-45c4-84da-9ced7235cc9f','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0116 MZO  Contry 2014 - March 2 (early bird day 2)
      ('a67ae3d0-9a5d-4dd1-8438-fc8bdb418b93','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0120 MZO  Contry 2014 - March 2 (early bird day 2)
      ('d9b79491-3cbb-44d5-b49b-c2831cbc5769','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0123 MZO  Contry 2014 - March 2 (early bird day 2)
      ('ee3ff070-79d2-49ec-bfcd-0bf2247eae62','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0132 MZO  Contry 2014 - March 2 (early bird day 2)
      ('a8b0fe6f-28d5-4ae9-a688-bc4206c65061','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0137 MZO  Contry 2014 - March 2 (early bird day 2)
      ('f256ff6c-a210-47c1-aa97-3b39f41b8f1d','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- DF-0101 MZO  Contry 2013 - March 27
      ('69d9e042-6bad-4f67-b331-ad28160231cf','cash','2026-03-27 18:00:00+00',750,'2026-03-01',false),
      -- DF-0246 MZO  Contry 2014 - March 2 (cash, early bird; method updated above if exists)
      ('498706e9-8848-4280-9453-978ff7ab901c','cash','2026-03-02 18:00:00+00',600,'2026-03-01',true),
      -- STRIPE / 360PLAYER PAYMENTS
      -- All $600 early bird. Dates: mostly March 1 (day 1); DF-0373 March 3 (day 3).
      -- DF-0675 LV 2022
      ('f822ced1-781a-4c17-9a33-3d43488847fd','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0602 LV 2018
      ('8e211b65-e9a4-4b70-8ea8-afd7bb83f433','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0623 LV 2018
      ('64ce48fe-02e1-4df7-8380-917a2cf3230b','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0624 LV 2018
      ('874be459-b862-4e30-9bca-3198c966effd','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0584 LV 2017
      ('5129d240-321e-42bc-9f71-f6ecaae380bb','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0591 LV 2017
      ('bb552729-4125-4807-9c37-dae3c2248e65','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0575 LV 2017 (Abraham Elizondo Escobedo - correct record; DF-0574 deleted above)
      ('36a04bc4-d63e-4233-b7f0-12157fb25cca','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0532 LV 2016
      ('f1d7b105-e659-4717-9699-79dc35654c1d','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0512 LV 2015
      ('1fd9b176-97ba-40c0-a851-51a934f45804','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0364 LV 2012
      ('c564ab15-bbe2-4c4a-8993-67be743de6e6','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0373 LV 2012 - March 3 (day 3, early bird; birth_date corrected to 2012 in Section 1)
      ('31795952-1e84-4bf0-b8d9-fc51e2528fff','stripe_360player','2026-03-03 18:00:00+00',600,'2026-03-01',true),
      -- DF-0234 Contry 2019 - March 1
      ('5ce9137e-aa81-49f7-b829-c046602fd365','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0218 Contry 2018
      ('719188f4-9254-423e-a3a5-705ac1d62b52','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0220 Contry 2018
      ('0a160aa0-2672-4fff-8f4c-6645ddb544fe','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0185 Contry 2016 (last_name corrected to Fernández Harsanyi in Section 1)
      ('58259855-4bfe-4b74-b364-8edfb31bd01b','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0193 Contry 2016
      ('31bf677d-c822-4014-867c-24a8263cef49','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0151 Contry 2015 (last_name corrected to Álvarez Rodríguez in Section 1)
      ('a167bacc-791c-432b-879e-ad726177f174','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0165 Contry 2015 (last_name corrected to García González in Section 1)
      ('052f3916-761a-46c2-8934-e527d76bb1a8','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0108 Contry 2014
      ('257a0547-fd21-48be-b44a-a2b446b085d7','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0109 Contry 2014 (last_name corrected to Montelongo Martínez in Section 1)
      ('fb9fb9c2-4ac1-46e5-82bf-d8f9e25a3026','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0133 Contry 2014
      ('f6a6e30e-8830-48d3-a6c1-b404d59fd4ff','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0134 Contry 2014
      ('ec416fc2-4423-48cd-82eb-3410e77bd3e0','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0136 Contry 2014
      ('6dd4f93b-8303-42a6-9eeb-6845005c5cef','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0143 Contry 2014
      ('ce8da719-ae31-4d91-ba34-68aced13232f','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0080 Contry 2013
      ('89f7d12a-44c0-490b-80af-fb307ad43288','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true),
      -- DF-0015 Contry 2010
      ('964e7a37-41fa-42b5-b102-eece175463e5','stripe_360player','2026-03-01 18:00:00+00',600,'2026-03-01',true)
    ) AS t(player_id, method, paid_at, amount, period, is_early_bird)
  LOOP
    -- 1. Find active enrollment
    SELECT id, start_date INTO v_enroll_id, v_enroll_start
    FROM public.enrollments
    WHERE player_id = r.player_id AND status = 'active';

    IF v_enroll_id IS NULL THEN
      RAISE WARNING 'Patch1: no active enrollment for player %, skipping', r.player_id;
      CONTINUE;
    END IF;

    -- 2. Find or create monthly_tuition charge for the period
    SELECT id INTO v_charge_id
    FROM public.charges
    WHERE enrollment_id = v_enroll_id
      AND charge_type_id = v_charge_type_id
      AND period_month = r.period
      AND status != 'void';

    IF v_charge_id IS NULL THEN
      INSERT INTO public.charges
        (enrollment_id, charge_type_id, description, amount, currency, status, period_month, due_date)
      VALUES (
        v_enroll_id,
        v_charge_type_id,
        'Mensualidad ' || to_char(r.period, 'TMMonth YYYY'),
        750, 'MXN', 'pending',
        r.period,
        r.period
      )
      RETURNING id INTO v_charge_id;
    END IF;

    -- 3. Early bird: update charge to $600 if paid day 1-10
    --    and enrollment did not start in the same month as the charge period
    IF r.is_early_bird
      AND date_trunc('month', v_enroll_start)::date != r.period
    THEN
      UPDATE public.charges
      SET amount = 600, updated_at = now()
      WHERE id = v_charge_id AND amount = 750;
    END IF;

    -- 4. Idempotency: skip if charge is already fully covered by a posted payment
    IF EXISTS (
      SELECT 1 FROM public.payment_allocations pa
      JOIN public.payments p ON p.id = pa.payment_id
      WHERE pa.charge_id = v_charge_id AND p.status != 'void'
    ) THEN
      RAISE NOTICE 'Patch1: charge for player % period % already has allocation, skipping', r.player_id, r.period;
      CONTINUE;
    END IF;

    -- 5. Insert payment
    INSERT INTO public.payments
      (enrollment_id, paid_at, method, amount, currency, status, external_source, notes)
    VALUES (
      v_enroll_id,
      r.paid_at,
      r.method,
      r.amount,
      'MXN',
      'posted',
      'manual',
      'Patch 1 backfill'
    )
    RETURNING id INTO v_pay_id;

    -- 6. Insert payment_allocation
    INSERT INTO public.payment_allocations (payment_id, charge_id, amount)
    VALUES (v_pay_id, v_charge_id, r.amount);

    RAISE NOTICE 'Patch1: payment inserted - player=% period=% method=% amount=%',
      r.player_id, r.period, r.method, r.amount;
  END LOOP;
END $$;
