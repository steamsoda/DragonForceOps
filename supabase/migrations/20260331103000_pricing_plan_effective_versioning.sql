alter table public.pricing_plans
  add column if not exists plan_code text,
  add column if not exists effective_start date,
  add column if not exists effective_end date;

update public.pricing_plans
set plan_code = case
  when lower(name) like '%retorno%' then 'retorno'
  else 'standard'
end
where plan_code is null;

update public.pricing_plans
set effective_start = date '2000-01-01'
where effective_start is null;

alter table public.pricing_plans
  alter column plan_code set not null,
  alter column effective_start set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pricing_plans_effective_window_check'
  ) then
    alter table public.pricing_plans
      add constraint pricing_plans_effective_window_check
      check (effective_end is null or effective_end >= effective_start);
  end if;
end $$;

create index if not exists idx_pricing_plans_code_effective_window
  on public.pricing_plans (plan_code, is_active, effective_start desc, effective_end);
