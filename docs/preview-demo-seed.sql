BEGIN;

-- Preview-only additive demo seed.
-- Purpose: create clearly fake records for UI/testing in the preview DB.
-- This is NOT a migration and is NOT idempotent. Run only when you want a new demo batch.

CREATE TEMP TABLE demo_ref ON COMMIT DROP AS
WITH active_plan AS (
  SELECT id AS pricing_plan_id, currency
  FROM public.pricing_plans
  WHERE is_active = true
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1
),
active_campuses AS (
  SELECT
    COALESCE(
      MAX(id) FILTER (WHERE code = 'LINDA_VISTA'),
      MAX(id) FILTER (WHERE name ILIKE '%Linda%')
    ) AS linda_vista_id,
    COALESCE(
      MAX(id) FILTER (WHERE code = 'CONTRY'),
      MAX(id) FILTER (WHERE name ILIKE '%Contry%')
    ) AS contry_id
  FROM public.campuses
  WHERE is_active = true
),
charge_type_ids AS (
  SELECT
    MAX(id) FILTER (WHERE code = 'inscription') AS inscription_type_id,
    MAX(id) FILTER (WHERE code = 'monthly_tuition') AS tuition_type_id
  FROM public.charge_types
)
SELECT *
FROM active_plan
CROSS JOIN active_campuses
CROSS JOIN charge_type_ids;

DO $$
DECLARE
  refs RECORD;
BEGIN
  SELECT * INTO refs FROM demo_ref;
  IF refs.pricing_plan_id IS NULL THEN
    RAISE EXCEPTION 'No active pricing plan found.';
  END IF;
  IF refs.linda_vista_id IS NULL OR refs.contry_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve Linda Vista and Contry campuses.';
  END IF;
  IF refs.inscription_type_id IS NULL OR refs.tuition_type_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve inscription/monthly_tuition charge types.';
  END IF;
END $$;

CREATE TEMP TABLE demo_students (
  idx              int PRIMARY KEY,
  campus_slug      text NOT NULL,
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  birth_date       date NOT NULL,
  gender           text NOT NULL,
  start_date       date NOT NULL,
  guardian_first   text NOT NULL,
  guardian_last    text NOT NULL,
  guardian_phone   text NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_students (idx, campus_slug, first_name, last_name, birth_date, gender, start_date, guardian_first, guardian_last, guardian_phone)
VALUES
  ( 1, 'LV', 'Mateo Demo01',   'ZZ Preview LV01', '2011-02-14', 'male',   '2026-01-06', 'Paula',   'Preview01', '5559000001'),
  ( 2, 'LV', 'Sofia Demo02',   'ZZ Preview LV02', '2012-05-09', 'female', '2026-01-08', 'Ramon',   'Preview02', '5559000002'),
  ( 3, 'LV', 'Diego Demo03',   'ZZ Preview LV03', '2013-08-20', 'male',   '2026-01-15', 'Lucia',   'Preview03', '5559000003'),
  ( 4, 'LV', 'Valeria Demo04', 'ZZ Preview LV04', '2014-11-03', 'female', '2026-01-18', 'Martin',  'Preview04', '5559000004'),
  ( 5, 'LV', 'Emilio Demo05',  'ZZ Preview LV05', '2015-01-26', 'male',   '2026-01-05', 'Julia',   'Preview05', '5559000005'),
  ( 6, 'LV', 'Renata Demo06',  'ZZ Preview LV06', '2016-04-17', 'female', '2026-01-07', 'Daniel',  'Preview06', '5559000006'),
  ( 7, 'LV', 'Tomas Demo07',   'ZZ Preview LV07', '2017-07-12', 'male',   '2026-01-10', 'Elena',   'Preview07', '5559000007'),
  ( 8, 'LV', 'Camila Demo08',  'ZZ Preview LV08', '2018-09-29', 'female', '2026-01-09', 'Pedro',   'Preview08', '5559000008'),
  ( 9, 'LV', 'Andres Demo09',  'ZZ Preview LV09', '2013-03-05', 'male',   '2026-02-04', 'Sara',    'Preview09', '5559000009'),
  (10, 'LV', 'Elisa Demo10',   'ZZ Preview LV10', '2011-12-22', 'female', '2026-02-18', 'Jorge',   'Preview10', '5559000010'),
  (11, 'CT', 'Gael Demo11',    'ZZ Preview CT11', '2012-06-10', 'male',   '2026-01-06', 'Monica',  'Preview11', '5559000011'),
  (12, 'CT', 'Mia Demo12',     'ZZ Preview CT12', '2014-10-01', 'female', '2026-01-08', 'Alberto', 'Preview12', '5559000012'),
  (13, 'CT', 'Bruno Demo13',   'ZZ Preview CT13', '2015-02-19', 'male',   '2026-02-16', 'Ariana',  'Preview13', '5559000013'),
  (14, 'CT', 'Julia Demo14',   'ZZ Preview CT14', '2016-05-27', 'female', '2026-02-07', 'Hector',  'Preview14', '5559000014'),
  (15, 'CT', 'Leo Demo15',     'ZZ Preview CT15', '2017-08-08', 'male',   '2026-01-04', 'Nadia',   'Preview15', '5559000015'),
  (16, 'CT', 'Zoe Demo16',     'ZZ Preview CT16', '2018-01-30', 'female', '2026-01-11', 'Ivan',    'Preview16', '5559000016'),
  (17, 'CT', 'Nico Demo17',    'ZZ Preview CT17', '2011-04-15', 'male',   '2026-03-05', 'Lilia',   'Preview17', '5559000017'),
  (18, 'CT', 'Abril Demo18',   'ZZ Preview CT18', '2013-09-18', 'female', '2026-03-20', 'Oscar',   'Preview18', '5559000018'),
  (19, 'CT', 'Ian Demo19',     'ZZ Preview CT19', '2014-07-02', 'male',   '2026-02-10', 'Paty',    'Preview19', '5559000019'),
  (20, 'CT', 'Emma Demo20',    'ZZ Preview CT20', '2016-12-11', 'female', '2026-02-17', 'Rene',    'Preview20', '5559000020');

CREATE TEMP TABLE demo_players ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.players (
    first_name, last_name, birth_date, gender, status, medical_notes, created_at, updated_at
  )
  SELECT
    first_name,
    last_name,
    birth_date,
    gender,
    'active',
    'Preview demo seed',
    now(),
    now()
  FROM demo_students
  RETURNING id, first_name, last_name, birth_date
)
SELECT s.idx, i.id AS player_id
FROM demo_students s
JOIN inserted i
  ON i.first_name = s.first_name
 AND i.last_name = s.last_name
 AND i.birth_date = s.birth_date;

CREATE TEMP TABLE demo_guardians ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.guardians (
    first_name, last_name, phone_primary, relationship_label, created_at, updated_at
  )
  SELECT
    guardian_first,
    guardian_last,
    guardian_phone,
    'Tutor Demo',
    now(),
    now()
  FROM demo_students
  RETURNING id, phone_primary
)
SELECT s.idx, i.id AS guardian_id
FROM demo_students s
JOIN inserted i
  ON i.phone_primary = s.guardian_phone;

INSERT INTO public.player_guardians (player_id, guardian_id, is_primary, created_at)
SELECT p.player_id, g.guardian_id, true, now()
FROM demo_players p
JOIN demo_guardians g USING (idx);

CREATE TEMP TABLE demo_enrollments ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.enrollments (
    player_id, campus_id, pricing_plan_id, status, start_date, inscription_date, notes, created_at, updated_at
  )
  SELECT
    p.player_id,
    CASE WHEN s.campus_slug = 'LV' THEN r.linda_vista_id ELSE r.contry_id END,
    r.pricing_plan_id,
    'active',
    s.start_date,
    s.start_date,
    'Preview demo seed - additive fake data',
    now(),
    now()
  FROM demo_students s
  JOIN demo_players p USING (idx)
  CROSS JOIN demo_ref r
  RETURNING id, player_id, start_date
)
SELECT s.idx, i.id AS enrollment_id
FROM demo_students s
JOIN demo_players p USING (idx)
JOIN inserted i
  ON i.player_id = p.player_id
 AND i.start_date = s.start_date;

CREATE TEMP TABLE demo_charge_plan (
  idx          int NOT NULL,
  charge_code  text NOT NULL,
  charge_seq   int NOT NULL,
  period_month date NULL,
  description  text NOT NULL,
  amount       numeric(12,2) NOT NULL,
  due_date     date NULL
) ON COMMIT DROP;

INSERT INTO demo_charge_plan (idx, charge_code, charge_seq, period_month, description, amount, due_date)
SELECT
  s.idx,
  'inscription',
  1,
  NULL,
  'Inscripcion Demo',
  1800.00,
  s.start_date
FROM demo_students s;

INSERT INTO demo_charge_plan (idx, charge_code, charge_seq, period_month, description, amount, due_date)
SELECT
  s.idx,
  'monthly_tuition',
  1,
  date_trunc('month', s.start_date)::date,
  'Mensualidad Demo ' || to_char(date_trunc('month', s.start_date)::date, 'MM/YYYY'),
  CASE WHEN EXTRACT(DAY FROM s.start_date) <= 10 THEN 600.00 ELSE 750.00 END,
  (date_trunc('month', s.start_date)::date + INTERVAL '10 days')::date
FROM demo_students s;

INSERT INTO demo_charge_plan (idx, charge_code, charge_seq, period_month, description, amount, due_date)
VALUES
  (5,  'monthly_tuition', 2, '2026-02-01', 'Mensualidad Demo 02/2026', 750.00, '2026-02-10'),
  (6,  'monthly_tuition', 2, '2026-02-01', 'Mensualidad Demo 02/2026', 750.00, '2026-02-10'),
  (7,  'monthly_tuition', 2, '2026-02-01', 'Mensualidad Demo 02/2026', 750.00, '2026-02-10'),
  (8,  'monthly_tuition', 2, '2026-02-01', 'Mensualidad Demo 02/2026', 750.00, '2026-02-10'),
  (15, 'monthly_tuition', 2, '2026-03-01', 'Mensualidad Demo 03/2026', 600.00, '2026-03-10'),
  (16, 'monthly_tuition', 2, '2026-03-01', 'Mensualidad Demo 03/2026', 750.00, '2026-03-10');

CREATE TEMP TABLE demo_charges ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.charges (
    enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date, created_by, created_at, updated_at
  )
  SELECT
    e.enrollment_id,
    CASE
      WHEN cp.charge_code = 'inscription' THEN r.inscription_type_id
      ELSE r.tuition_type_id
    END,
    cp.period_month,
    cp.description,
    cp.amount,
    r.currency,
    'pending',
    cp.due_date,
    NULL,
    COALESCE(cp.due_date, current_date)::timestamp + TIME '10:00',
    COALESCE(cp.due_date, current_date)::timestamp + TIME '10:00'
  FROM demo_charge_plan cp
  JOIN demo_enrollments e USING (idx)
  CROSS JOIN demo_ref r
  RETURNING id, enrollment_id, description, amount, period_month
)
SELECT
  cp.idx,
  cp.charge_code,
  cp.charge_seq,
  i.id AS charge_id
FROM demo_charge_plan cp
JOIN demo_enrollments e USING (idx)
JOIN inserted i
  ON i.enrollment_id = e.enrollment_id
 AND i.description = cp.description
 AND i.amount = cp.amount
 AND COALESCE(i.period_month, DATE '1900-01-01') = COALESCE(cp.period_month, DATE '1900-01-01');

CREATE TEMP TABLE demo_payment_plan (
  idx         int NOT NULL,
  payment_seq int NOT NULL,
  method      text NOT NULL,
  amount      numeric(12,2) NOT NULL,
  paid_at     timestamptz NOT NULL,
  notes       text NULL
) ON COMMIT DROP;

INSERT INTO demo_payment_plan (idx, payment_seq, method, amount, paid_at, notes)
VALUES
  ( 1, 1, 'cash',             2400.00, current_date::timestamp + TIME '09:10',                    'Preview demo full payment'),
  ( 2, 1, 'transfer',         1200.00, (current_date - INTERVAL '1 day')::timestamp + TIME '10:15', 'Preview demo partial payment'),
  ( 3, 1, 'card',             2600.00, (current_date - INTERVAL '2 day')::timestamp + TIME '12:00', 'Preview demo overpayment'),
  ( 4, 1, 'stripe_360player', 2550.00, (current_date - INTERVAL '3 day')::timestamp + TIME '15:20', 'Preview demo stripe full'),
  ( 6, 1, 'cash',              600.00, (current_date - INTERVAL '2 day')::timestamp + TIME '09:30', 'Preview demo split across months'),
  ( 6, 2, 'transfer',          750.00, (current_date - INTERVAL '1 day')::timestamp + TIME '16:05', 'Preview demo split across months'),
  ( 7, 1, 'cash',              600.00, (current_date - INTERVAL '4 day')::timestamp + TIME '11:40', 'Preview tuition only'),
  ( 8, 1, 'card',              900.00, (current_date - INTERVAL '1 day')::timestamp + TIME '13:10', 'Preview partial inscription'),
  ( 8, 2, 'cash',              900.00, current_date::timestamp + TIME '13:45',                    'Preview partial inscription'),
  ( 9, 1, 'transfer',         2400.00, (current_date - INTERVAL '5 day')::timestamp + TIME '10:50', 'Preview full transfer'),
  (11, 1, 'cash',             2400.00, current_date::timestamp + TIME '17:15',                    'Preview full cash'),
  (12, 1, 'stripe_360player', 1800.00, (current_date - INTERVAL '2 day')::timestamp + TIME '14:35', 'Preview stripe inscription'),
  (13, 1, 'card',             2550.00, (current_date - INTERVAL '6 day')::timestamp + TIME '09:55', 'Preview full card'),
  (14, 1, 'cash',             2450.00, current_date::timestamp + TIME '18:05',                    'Preview small credit'),
  (16, 1, 'transfer',          750.00, (current_date - INTERVAL '1 day')::timestamp + TIME '09:05', 'Preview first payment'),
  (16, 2, 'card',              750.00, current_date::timestamp + TIME '11:25',                    'Preview second payment'),
  (17, 1, 'cash',              600.00, current_date::timestamp + TIME '12:30',                    'Preview partial cash'),
  (19, 1, 'transfer',         2400.00, (current_date - INTERVAL '3 day')::timestamp + TIME '08:45', 'Preview full transfer'),
  (20, 1, 'card',             2400.00, current_date::timestamp + TIME '16:40',                    'Preview almost full');

CREATE TEMP TABLE demo_payments ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.payments (
    enrollment_id, paid_at, method, amount, currency, status, provider_ref, external_source, notes, created_by, created_at, updated_at
  )
  SELECT
    e.enrollment_id,
    pp.paid_at,
    pp.method::public.payment_method,
    pp.amount,
    r.currency,
    'posted',
    'preview-demo-' || pp.idx || '-' || pp.payment_seq,
    'manual',
    pp.notes,
    NULL,
    pp.paid_at,
    pp.paid_at
  FROM demo_payment_plan pp
  JOIN demo_enrollments e USING (idx)
  CROSS JOIN demo_ref r
  RETURNING id, enrollment_id, provider_ref
)
SELECT
  pp.idx,
  pp.payment_seq,
  i.id AS payment_id
FROM demo_payment_plan pp
JOIN demo_enrollments e USING (idx)
JOIN inserted i
  ON i.enrollment_id = e.enrollment_id
 AND i.provider_ref = 'preview-demo-' || pp.idx || '-' || pp.payment_seq;

CREATE TEMP TABLE demo_alloc_plan (
  idx         int NOT NULL,
  payment_seq int NOT NULL,
  charge_code text NOT NULL,
  charge_seq  int NOT NULL,
  amount      numeric(12,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_alloc_plan (idx, payment_seq, charge_code, charge_seq, amount)
VALUES
  ( 1, 1, 'inscription',     1, 1800.00), ( 1, 1, 'monthly_tuition', 1,  600.00),
  ( 2, 1, 'inscription',     1, 1200.00),
  ( 3, 1, 'inscription',     1, 1800.00), ( 3, 1, 'monthly_tuition', 1,  750.00),
  ( 4, 1, 'inscription',     1, 1800.00), ( 4, 1, 'monthly_tuition', 1,  750.00),
  ( 6, 1, 'monthly_tuition', 1,  600.00), ( 6, 2, 'monthly_tuition', 2,  750.00),
  ( 7, 1, 'monthly_tuition', 1,  600.00),
  ( 8, 1, 'inscription',     1,  900.00), ( 8, 2, 'inscription',     1,  900.00),
  ( 9, 1, 'inscription',     1, 1800.00), ( 9, 1, 'monthly_tuition', 1,  600.00),
  (11, 1, 'inscription',     1, 1800.00), (11, 1, 'monthly_tuition', 1,  600.00),
  (12, 1, 'inscription',     1, 1800.00),
  (13, 1, 'inscription',     1, 1800.00), (13, 1, 'monthly_tuition', 1,  750.00),
  (14, 1, 'inscription',     1, 1800.00), (14, 1, 'monthly_tuition', 1,  600.00),
  (16, 1, 'monthly_tuition', 1,  750.00), (16, 2, 'monthly_tuition', 2,  750.00),
  (17, 1, 'monthly_tuition', 1,  600.00),
  (19, 1, 'inscription',     1, 1800.00), (19, 1, 'monthly_tuition', 1,  600.00),
  (20, 1, 'inscription',     1, 1800.00), (20, 1, 'monthly_tuition', 1,  600.00);

INSERT INTO public.payment_allocations (payment_id, charge_id, amount, created_at)
SELECT
  p.payment_id,
  c.charge_id,
  a.amount,
  now()
FROM demo_alloc_plan a
JOIN demo_payments p
  ON p.idx = a.idx
 AND p.payment_seq = a.payment_seq
JOIN demo_charges c
  ON c.idx = a.idx
 AND c.charge_code = a.charge_code
 AND c.charge_seq = a.charge_seq;

COMMIT;
