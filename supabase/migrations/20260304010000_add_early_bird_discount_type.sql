-- Add early_bird_discount charge type for automatic early-payment discount credit lines.
-- These are negative-amount charges (amount <> 0 constraint allows this since migration 20260302130000).

insert into public.charge_types (code, name, is_active)
values ('early_bird_discount', 'Descuento pago anticipado', true)
on conflict (code) do update set name = excluded.name, is_active = excluded.is_active;
