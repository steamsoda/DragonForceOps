-- Preview sample data seed
-- Run this in the Preview project's SQL Editor only.
-- Safe to re-run (idempotent) for the same actor email.

do $$
declare
  actor_email text := 'javierg@dragonforcemty.com';
  actor_id uuid;

  role_director_admin_id uuid;

  campus_linda_id uuid;
  campus_contry_id uuid;

  plan_basico_id uuid;
  plan_avanzado_id uuid;

  type_inscription_id uuid;
  type_monthly_id uuid;
  type_uniform_id uuid;

  player_mateo_id uuid;
  player_lucia_id uuid;
  player_santiago_id uuid;

  guardian_ana_id uuid;
  guardian_jorge_id uuid;
  guardian_paola_id uuid;

  enrollment_mateo_id uuid;
  enrollment_lucia_id uuid;
  enrollment_santiago_id uuid;

  charge_mateo_inscription_id uuid;
  charge_mateo_monthly_id uuid;
  charge_lucia_monthly_id uuid;
  charge_santiago_uniform_id uuid;

  payment_mateo_id uuid;
  payment_lucia_id uuid;
  payment_santiago_id uuid;
begin
  select u.id into actor_id
  from auth.users u
  where lower(u.email) = lower(actor_email)
  limit 1;

  if actor_id is null then
    raise exception 'No auth.users row found for email %. Login first in preview, then run seed.', actor_email;
  end if;

  select id into role_director_admin_id
  from public.app_roles
  where code = 'director_admin'
  limit 1;

  if role_director_admin_id is null then
    raise exception 'Missing app role director_admin. Run core migrations first.';
  end if;

  insert into public.user_roles (user_id, role_id, campus_id)
  values (actor_id, role_director_admin_id, null)
  on conflict (user_id, role_id, campus_id) do nothing;

  select id into campus_linda_id from public.campuses where code = 'LINDA_VISTA' limit 1;
  select id into campus_contry_id from public.campuses where code = 'CONTRY' limit 1;

  if campus_linda_id is null or campus_contry_id is null then
    raise exception 'Missing campuses seed data. Run core migrations first.';
  end if;

  -- Pricing plans
  select id into plan_basico_id
  from public.pricing_plans
  where name = 'Plan Mensual Basico'
  limit 1;

  if plan_basico_id is null then
    insert into public.pricing_plans (name, currency, is_active)
    values ('Plan Mensual Basico', 'MXN', true)
    returning id into plan_basico_id;
  end if;

  select id into plan_avanzado_id
  from public.pricing_plans
  where name = 'Plan Mensual Avanzado'
  limit 1;

  if plan_avanzado_id is null then
    insert into public.pricing_plans (name, currency, is_active)
    values ('Plan Mensual Avanzado', 'MXN', true)
    returning id into plan_avanzado_id;
  end if;

  -- Tuition rules
  insert into public.pricing_plan_tuition_rules (pricing_plan_id, day_from, day_to, amount, priority)
  values
    (plan_basico_id, 1, 10, 1500, 1),
    (plan_basico_id, 11, 20, 1600, 2),
    (plan_basico_id, 21, null, 1700, 3),
    (plan_avanzado_id, 1, 10, 2200, 1),
    (plan_avanzado_id, 11, 20, 2300, 2),
    (plan_avanzado_id, 21, null, 2400, 3)
  on conflict (pricing_plan_id, day_from, day_to) do nothing;

  -- Charge types
  select id into type_inscription_id from public.charge_types where code = 'inscription' limit 1;
  select id into type_monthly_id from public.charge_types where code = 'monthly_tuition' limit 1;
  select id into type_uniform_id from public.charge_types where code = 'uniform' limit 1;

  if type_inscription_id is null or type_monthly_id is null or type_uniform_id is null then
    raise exception 'Missing charge_types seed data. Run core migrations first.';
  end if;

  -- Players
  select id into player_mateo_id
  from public.players
  where first_name = 'Mateo' and last_name = 'Garcia' and birth_date = date '2014-03-18'
  limit 1;
  if player_mateo_id is null then
    insert into public.players (first_name, last_name, birth_date, gender, status, medical_notes)
    values ('Mateo', 'Garcia', date '2014-03-18', 'M', 'active', null)
    returning id into player_mateo_id;
  end if;

  select id into player_lucia_id
  from public.players
  where first_name = 'Lucia' and last_name = 'Martinez' and birth_date = date '2013-11-02'
  limit 1;
  if player_lucia_id is null then
    insert into public.players (first_name, last_name, birth_date, gender, status, medical_notes)
    values ('Lucia', 'Martinez', date '2013-11-02', 'F', 'active', 'Asma leve, trae inhalador.')
    returning id into player_lucia_id;
  end if;

  select id into player_santiago_id
  from public.players
  where first_name = 'Santiago' and last_name = 'Lopez' and birth_date = date '2015-07-24'
  limit 1;
  if player_santiago_id is null then
    insert into public.players (first_name, last_name, birth_date, gender, status, medical_notes)
    values ('Santiago', 'Lopez', date '2015-07-24', 'M', 'active', null)
    returning id into player_santiago_id;
  end if;

  -- Guardians
  select id into guardian_ana_id
  from public.guardians
  where first_name = 'Ana' and last_name = 'Garcia' and phone_primary = '8111002233'
  limit 1;
  if guardian_ana_id is null then
    insert into public.guardians (first_name, last_name, phone_primary, phone_secondary, email, relationship_label)
    values ('Ana', 'Garcia', '8111002233', null, 'ana.garcia@example.com', 'Madre')
    returning id into guardian_ana_id;
  end if;

  select id into guardian_jorge_id
  from public.guardians
  where first_name = 'Jorge' and last_name = 'Martinez' and phone_primary = '8112003344'
  limit 1;
  if guardian_jorge_id is null then
    insert into public.guardians (first_name, last_name, phone_primary, phone_secondary, email, relationship_label)
    values ('Jorge', 'Martinez', '8112003344', '8112007788', 'jorge.mtz@example.com', 'Padre')
    returning id into guardian_jorge_id;
  end if;

  select id into guardian_paola_id
  from public.guardians
  where first_name = 'Paola' and last_name = 'Lopez' and phone_primary = '8113004455'
  limit 1;
  if guardian_paola_id is null then
    insert into public.guardians (first_name, last_name, phone_primary, phone_secondary, email, relationship_label)
    values ('Paola', 'Lopez', '8113004455', null, 'paola.lopez@example.com', 'Madre')
    returning id into guardian_paola_id;
  end if;

  insert into public.player_guardians (player_id, guardian_id, is_primary)
  values
    (player_mateo_id, guardian_ana_id, true),
    (player_lucia_id, guardian_jorge_id, true),
    (player_santiago_id, guardian_paola_id, true)
  on conflict (player_id, guardian_id) do nothing;

  -- Enrollments (one active per player)
  select id into enrollment_mateo_id
  from public.enrollments
  where player_id = player_mateo_id and status = 'active'
  limit 1;
  if enrollment_mateo_id is null then
    insert into public.enrollments (
      player_id, campus_id, pricing_plan_id, status, start_date, inscription_date, notes
    )
    values (
      player_mateo_id, campus_linda_id, plan_basico_id, 'active', current_date - 90, current_date - 90, 'Seed preview'
    )
    returning id into enrollment_mateo_id;
  end if;

  select id into enrollment_lucia_id
  from public.enrollments
  where player_id = player_lucia_id and status = 'active'
  limit 1;
  if enrollment_lucia_id is null then
    insert into public.enrollments (
      player_id, campus_id, pricing_plan_id, status, start_date, inscription_date, notes
    )
    values (
      player_lucia_id, campus_contry_id, plan_avanzado_id, 'active', current_date - 60, current_date - 60, 'Seed preview'
    )
    returning id into enrollment_lucia_id;
  end if;

  select id into enrollment_santiago_id
  from public.enrollments
  where player_id = player_santiago_id and status = 'active'
  limit 1;
  if enrollment_santiago_id is null then
    insert into public.enrollments (
      player_id, campus_id, pricing_plan_id, status, start_date, inscription_date, notes
    )
    values (
      player_santiago_id, campus_linda_id, plan_basico_id, 'active', current_date - 30, current_date - 30, 'Seed preview'
    )
    returning id into enrollment_santiago_id;
  end if;

  -- Charges
  select id into charge_mateo_inscription_id
  from public.charges
  where enrollment_id = enrollment_mateo_id
    and description = 'Inscripcion ciclo 2026'
    and amount = 2500
  limit 1;
  if charge_mateo_inscription_id is null then
    insert into public.charges (
      enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date, created_by
    )
    values (
      enrollment_mateo_id, type_inscription_id, null, 'Inscripcion ciclo 2026', 2500, 'MXN', 'posted', current_date - 75, actor_id
    )
    returning id into charge_mateo_inscription_id;
  end if;

  select id into charge_mateo_monthly_id
  from public.charges
  where enrollment_id = enrollment_mateo_id
    and description = 'Mensualidad febrero 2026'
    and period_month = date_trunc('month', current_date)::date
  limit 1;
  if charge_mateo_monthly_id is null then
    insert into public.charges (
      enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date, created_by
    )
    values (
      enrollment_mateo_id, type_monthly_id, date_trunc('month', current_date)::date, 'Mensualidad febrero 2026', 1600, 'MXN', 'posted', current_date + 5, actor_id
    )
    returning id into charge_mateo_monthly_id;
  end if;

  select id into charge_lucia_monthly_id
  from public.charges
  where enrollment_id = enrollment_lucia_id
    and description = 'Mensualidad febrero 2026'
    and period_month = date_trunc('month', current_date)::date
  limit 1;
  if charge_lucia_monthly_id is null then
    insert into public.charges (
      enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date, created_by
    )
    values (
      enrollment_lucia_id, type_monthly_id, date_trunc('month', current_date)::date, 'Mensualidad febrero 2026', 2300, 'MXN', 'posted', current_date + 5, actor_id
    )
    returning id into charge_lucia_monthly_id;
  end if;

  select id into charge_santiago_uniform_id
  from public.charges
  where enrollment_id = enrollment_santiago_id
    and description = 'Uniforme entrenamiento'
    and amount = 1200
  limit 1;
  if charge_santiago_uniform_id is null then
    insert into public.charges (
      enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date, created_by
    )
    values (
      enrollment_santiago_id, type_uniform_id, null, 'Uniforme entrenamiento', 1200, 'MXN', 'pending', current_date + 10, actor_id
    )
    returning id into charge_santiago_uniform_id;
  end if;

  -- Payments
  select id into payment_mateo_id
  from public.payments
  where provider_ref = 'preview-seed-pay-mateo-001'
  limit 1;
  if payment_mateo_id is null then
    insert into public.payments (
      enrollment_id, paid_at, method, amount, currency, status, provider_ref, external_source, notes, created_by
    )
    values (
      enrollment_mateo_id, now() - interval '20 days', 'transfer', 3000, 'MXN', 'posted',
      'preview-seed-pay-mateo-001', 'manual', 'Pago inicial seed', actor_id
    )
    returning id into payment_mateo_id;
  end if;

  select id into payment_lucia_id
  from public.payments
  where provider_ref = 'preview-seed-pay-lucia-001'
  limit 1;
  if payment_lucia_id is null then
    insert into public.payments (
      enrollment_id, paid_at, method, amount, currency, status, provider_ref, external_source, notes, created_by
    )
    values (
      enrollment_lucia_id, now() - interval '10 days', 'cash', 1500, 'MXN', 'posted',
      'preview-seed-pay-lucia-001', 'manual', 'Abono parcial seed', actor_id
    )
    returning id into payment_lucia_id;
  end if;

  select id into payment_santiago_id
  from public.payments
  where provider_ref = 'preview-seed-pay-santiago-001'
  limit 1;
  if payment_santiago_id is null then
    insert into public.payments (
      enrollment_id, paid_at, method, amount, currency, status, provider_ref, external_source, notes, created_by
    )
    values (
      enrollment_santiago_id, now() - interval '3 days', 'card', 600, 'MXN', 'posted',
      'preview-seed-pay-santiago-001', 'manual', 'Abono uniforme seed', actor_id
    )
    returning id into payment_santiago_id;
  end if;

  -- Allocations
  insert into public.payment_allocations (payment_id, charge_id, amount)
  values
    (payment_mateo_id, charge_mateo_inscription_id, 2500),
    (payment_mateo_id, charge_mateo_monthly_id, 500),
    (payment_lucia_id, charge_lucia_monthly_id, 1500),
    (payment_santiago_id, charge_santiago_uniform_id, 600)
  on conflict (payment_id, charge_id) do nothing;
end $$;

