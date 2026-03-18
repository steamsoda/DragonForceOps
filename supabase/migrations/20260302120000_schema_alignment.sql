-- Schema alignment: player org hierarchy, uniform charge types, charge amount constraint
-- Corresponds to SDD sections 4.2, 5.3, 5.2
--
-- Changes:
--   players      → add level text null (B1/B2/B3, set by Director Deportivo)
--   teams        → rename age_group → birth_year int null (Categoría = year of birth)
--   teams        → add level text null, gender text null
--   charge_types → deactivate legacy 'uniform'; add 'uniform_training' + 'uniform_game'
--   charges      → relax amount constraint from > 0 to <> 0 (allows discount credit lines)

-- ─── players ────────────────────────────────────────────────────────────────

alter table public.players
  add column if not exists level text null;

-- ─── teams ──────────────────────────────────────────────────────────────────

-- Rename age_group → birth_year and change type from text to int.
-- Safe: teams table has no rows in preview or prod at this stage.
alter table public.teams
  rename column age_group to birth_year;

alter table public.teams
  alter column birth_year type int using birth_year::int;

alter table public.teams
  add column if not exists level  text null,
  add column if not exists gender text null;

-- ─── charge_types ───────────────────────────────────────────────────────────

-- Deactivate the generic 'uniform' type; existing charges that reference it
-- are unaffected (historical data preserved). New charges must use the
-- specific types below.
update public.charge_types
  set is_active = false
  where code = 'uniform';

insert into public.charge_types (code, name, is_active)
values
  ('uniform_training', 'Uniforme Entrenamiento', true),
  ('uniform_game',     'Uniforme Partido',       true)
on conflict (code) do nothing;

-- ─── charges.amount constraint ──────────────────────────────────────────────

-- Allow negative amounts for tuition discount credit lines (early-bird tier).
-- Find and drop the existing > 0 check, then replace with <> 0.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.charges'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%amount > 0%';

  if v_constraint is not null then
    execute 'alter table public.charges drop constraint ' || quote_ident(v_constraint);
  end if;
end $$;

alter table public.charges
  add constraint charges_amount_nonzero check (amount <> 0);
