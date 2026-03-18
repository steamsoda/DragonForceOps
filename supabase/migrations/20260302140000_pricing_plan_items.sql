-- pricing_plan_items: fixed-price catalog entries per pricing plan
-- Covers inscription, uniform_training, uniform_game (and any future ad-hoc types).
-- Monthly tuition tiers remain in pricing_plan_tuition_rules.
--
-- Initial seed amounts below are placeholders — update via a future migration
-- once real prices are confirmed by the director.

-- ─── Table ──────────────────────────────────────────────────────────────────

create table if not exists public.pricing_plan_items (
  id              uuid           primary key default gen_random_uuid(),
  pricing_plan_id uuid           not null references public.pricing_plans(id) on delete cascade,
  charge_type_id  uuid           not null references public.charge_types(id)  on delete restrict,
  amount          numeric(12,2)  not null check (amount > 0),
  currency        text           not null default 'MXN',
  is_active       boolean        not null default true,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  unique (pricing_plan_id, charge_type_id)
);

-- Unique constraint above implicitly creates an index on (pricing_plan_id, charge_type_id),
-- which is the exact access pattern used at enrollment creation time.

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.pricing_plan_items enable row level security;

drop policy if exists director_admin_all_pricing_plan_items on public.pricing_plan_items;
create policy director_admin_all_pricing_plan_items on public.pricing_plan_items
for all
using  (public.is_director_admin())
with check (public.is_director_admin());

-- ─── Initial seed data ───────────────────────────────────────────────────────
-- Uses DO block to resolve plan and charge-type IDs by code (no hardcoded UUIDs).
-- Amounts are initial placeholders — update via a future migration with real prices.
--
-- Seeded charge types per plan:
--   inscription     = 2,500 MXN
--   uniform_training = 1,200 MXN
--   uniform_game    = 1,500 MXN  ← confirm actual price with director

do $$
declare
  plan_basico_id    uuid;
  plan_avanzado_id  uuid;
  ct_inscription_id    uuid;
  ct_uniform_training_id uuid;
  ct_uniform_game_id uuid;
begin
  select id into plan_basico_id
    from public.pricing_plans where name = 'Plan Mensual Basico' limit 1;

  select id into plan_avanzado_id
    from public.pricing_plans where name = 'Plan Mensual Avanzado' limit 1;

  select id into ct_inscription_id
    from public.charge_types where code = 'inscription' limit 1;

  select id into ct_uniform_training_id
    from public.charge_types where code = 'uniform_training' limit 1;

  select id into ct_uniform_game_id
    from public.charge_types where code = 'uniform_game' limit 1;

  -- Only seed if plans exist (preview has them; prod will have them once seeded)
  if plan_basico_id is not null and ct_inscription_id is not null then
    insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
    values
      (plan_basico_id, ct_inscription_id,       2500),
      (plan_basico_id, ct_uniform_training_id,  1200),
      (plan_basico_id, ct_uniform_game_id,      1500)
    on conflict (pricing_plan_id, charge_type_id) do nothing;
  end if;

  if plan_avanzado_id is not null and ct_inscription_id is not null then
    insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
    values
      (plan_avanzado_id, ct_inscription_id,       2500),
      (plan_avanzado_id, ct_uniform_training_id,  1200),
      (plan_avanzado_id, ct_uniform_game_id,      1500)
    on conflict (pricing_plan_id, charge_type_id) do nothing;
  end if;
end $$;
