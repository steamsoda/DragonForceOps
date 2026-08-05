alter table public.products
  add column if not exists requires_pricing_rule_match boolean not null default false;

comment on column public.products.requires_pricing_rule_match is
  'When true, Caja hides and rejects this product unless an active pricing rule matches the enrollment context.';

update public.products
set requires_pricing_rule_match = true
where name = 'J5 San Pedro Agosto 2026';
