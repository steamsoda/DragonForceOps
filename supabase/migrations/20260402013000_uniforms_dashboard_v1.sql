alter table public.charges
  add column if not exists uniform_fulfillment_mode text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'charges_uniform_fulfillment_mode_check'
      and conrelid = 'public.charges'::regclass
  ) then
    alter table public.charges
      add constraint charges_uniform_fulfillment_mode_check
      check (uniform_fulfillment_mode in ('deliver_now', 'pending_order'));
  end if;
end $$;

alter table public.uniform_orders
  add column if not exists sold_at timestamptz null;

alter table public.uniform_orders
  alter column ordered_at drop not null,
  alter column ordered_at drop default;

alter table public.uniform_orders
  drop constraint if exists uniform_orders_status_check;

alter table public.uniform_orders
  add constraint uniform_orders_status_check
  check (status in ('pending_order', 'ordered', 'delivered'));

update public.uniform_orders
set sold_at = coalesce(sold_at, ordered_at, updated_at)
where sold_at is null;

update public.uniform_orders
set status = 'pending_order',
    ordered_at = null
where status = 'ordered';

create unique index if not exists idx_uniform_orders_charge_unique
  on public.uniform_orders (charge_id)
  where charge_id is not null;

create index if not exists idx_uniform_orders_status
  on public.uniform_orders (status);

create index if not exists idx_uniform_orders_sold_at
  on public.uniform_orders (sold_at);

create index if not exists idx_uniform_orders_delivered_at
  on public.uniform_orders (delivered_at);

comment on column public.charges.uniform_fulfillment_mode is
  'Uniform fulfillment preference captured at sale time: deliver_now or pending_order.';

comment on column public.uniform_orders.sold_at is
  'Timestamp when the uniform charge became fully paid and entered fulfillment workflow.';

comment on column public.uniform_orders.ordered_at is
  'Timestamp when staff marked the item as ordered from the supplier.';

comment on column public.uniform_orders.status is
  'pending_order = sold but not yet ordered from supplier; ordered = supplier order placed; delivered = physically handed to player';
