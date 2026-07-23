create or replace function public.reprice_unallocated_product_charge(
  p_charge_id uuid,
  p_new_amount numeric
)
returns table (
  ok boolean,
  error_code text,
  old_amount numeric,
  new_amount numeric,
  product_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charge public.charges%rowtype;
  v_new_amount numeric(12, 2);
begin
  v_new_amount := round(p_new_amount, 2);

  if v_new_amount is null or v_new_amount <= 0 or v_new_amount > 1000000 then
    return query select false, 'reprice_amount_invalid', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_charge
  from public.charges
  where id = p_charge_id
  for update;

  if not found then
    return query select false, 'charge_not_found', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_charge.product_id is null then
    return query select false, 'charge_not_product', v_charge.amount, v_charge.amount, null::uuid;
    return;
  end if;

  if v_charge.status <> 'pending' then
    return query select false, 'charge_not_pending', v_charge.amount, v_charge.amount, v_charge.product_id;
    return;
  end if;

  if exists (
    select 1 from public.payment_allocations where charge_id = p_charge_id
  ) or exists (
    select 1 from public.enrollment_credit_applications where charge_id = p_charge_id
  ) then
    return query select false, 'charge_has_allocations', v_charge.amount, v_charge.amount, v_charge.product_id;
    return;
  end if;

  if v_charge.amount = v_new_amount then
    return query select true, null::text, v_charge.amount, v_charge.amount, v_charge.product_id;
    return;
  end if;

  update public.charges
  set amount = v_new_amount,
      pricing_rule_id = null,
      updated_at = now()
  where id = p_charge_id;

  return query select true, null::text, v_charge.amount, v_new_amount, v_charge.product_id;
end;
$$;

revoke all on function public.reprice_unallocated_product_charge(uuid, numeric) from public;
revoke all on function public.reprice_unallocated_product_charge(uuid, numeric) from anon;
revoke all on function public.reprice_unallocated_product_charge(uuid, numeric) from authenticated;
grant execute on function public.reprice_unallocated_product_charge(uuid, numeric) to service_role;

comment on function public.reprice_unallocated_product_charge(uuid, numeric) is
  'Atomically overrides one pending, unallocated catalog-product charge. Service-role only; caller must enforce operator authorization and write the audit reason.';
