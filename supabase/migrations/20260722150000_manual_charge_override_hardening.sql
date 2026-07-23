alter table public.charges
  add column if not exists manual_price_override boolean not null default false,
  add column if not exists manual_price_override_reason text null,
  add column if not exists manual_price_override_at timestamptz null,
  add column if not exists manual_price_override_by uuid null references auth.users(id) on delete set null,
  add column if not exists manual_price_original_amount numeric(12, 2) null,
  add column if not exists manual_price_original_pricing_rule_id uuid null references public.pricing_plan_tuition_rules(id) on delete set null;

create index if not exists idx_charges_manual_price_override
  on public.charges (manual_price_override)
  where manual_price_override = true;

-- Preserve any preview overrides already recorded by the immediately preceding release.
with latest_override as (
  select distinct on (record_id)
    record_id,
    actor_user_id,
    event_at,
    before_data,
    after_data
  from public.audit_logs
  where table_name = 'charges'
    and record_id is not null
    and action in ('charge.repriced.product_override', 'charge.repriced.manual_override')
  order by record_id, event_at desc, id desc
)
update public.charges c
set manual_price_override = true,
    manual_price_override_reason = coalesce(nullif(latest_override.after_data ->> 'reason', ''), 'Migrated audited manual override'),
    manual_price_override_at = latest_override.event_at,
    manual_price_override_by = latest_override.actor_user_id,
    manual_price_original_amount = case
      when coalesce(latest_override.before_data ->> 'amount', '') ~ '^\d+(\.\d+)?$'
        then (latest_override.before_data ->> 'amount')::numeric
      else c.amount
    end,
    manual_price_original_pricing_rule_id = case
      when coalesce(latest_override.before_data ->> 'pricing_rule_id', '') ~ '^[0-9a-fA-F-]{36}$'
        then (latest_override.before_data ->> 'pricing_rule_id')::uuid
      else null
    end
from latest_override
where c.id = latest_override.record_id
  and c.status = 'pending'
  and coalesce(latest_override.after_data ->> 'amount', '') ~ '^\d+(\.\d+)?$'
  and c.amount = (latest_override.after_data ->> 'amount')::numeric
  and not exists (select 1 from public.payment_allocations pa where pa.charge_id = c.id)
  and not exists (select 1 from public.enrollment_credit_applications eca where eca.charge_id = c.id);

drop function if exists public.reprice_unallocated_charge(uuid, numeric);

create or replace function public.reprice_unallocated_charge(
  p_charge_id uuid,
  p_new_amount numeric,
  p_actor_user_id uuid,
  p_reason text
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
  v_reason text;
begin
  v_new_amount := round(p_new_amount, 2);
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    return query select false, 'reprice_actor_invalid', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_reason is null then
    return query select false, 'reprice_reason_required', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_new_amount is null or v_new_amount <= 0 or v_new_amount > 1000000 then
    return query select false, 'reprice_amount_invalid', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select * into v_charge
  from public.charges
  where id = p_charge_id
  for update;

  if not found then
    return query select false, 'charge_not_found', null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_charge.status <> 'pending' then
    return query select false, 'charge_not_pending', v_charge.amount, v_charge.amount, v_charge.product_id;
    return;
  end if;

  if exists (select 1 from public.payment_allocations where charge_id = p_charge_id)
    or exists (select 1 from public.enrollment_credit_applications where charge_id = p_charge_id) then
    return query select false, 'charge_has_allocations', v_charge.amount, v_charge.amount, v_charge.product_id;
    return;
  end if;

  update public.charges
  set amount = v_new_amount,
      pricing_rule_id = null,
      manual_price_override = true,
      manual_price_override_reason = v_reason,
      manual_price_override_at = now(),
      manual_price_override_by = p_actor_user_id,
      manual_price_original_amount = coalesce(manual_price_original_amount, v_charge.amount),
      manual_price_original_pricing_rule_id = case
        when manual_price_override then manual_price_original_pricing_rule_id
        else v_charge.pricing_rule_id
      end,
      updated_at = now()
  where id = p_charge_id;

  return query select true, null::text, v_charge.amount, v_new_amount, v_charge.product_id;
end;
$$;

revoke all on function public.reprice_unallocated_charge(uuid, numeric, uuid, text) from public;
revoke all on function public.reprice_unallocated_charge(uuid, numeric, uuid, text) from anon;
revoke all on function public.reprice_unallocated_charge(uuid, numeric, uuid, text) from authenticated;
grant execute on function public.reprice_unallocated_charge(uuid, numeric, uuid, text) to service_role;

create or replace function public.restore_unallocated_charge_price(
  p_charge_id uuid,
  p_actor_user_id uuid
)
returns table (
  ok boolean,
  error_code text,
  old_amount numeric,
  restored_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charge public.charges%rowtype;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    return query select false, 'reprice_actor_invalid', null::numeric, null::numeric;
    return;
  end if;

  select * into v_charge
  from public.charges
  where id = p_charge_id
  for update;

  if not found then
    return query select false, 'charge_not_found', null::numeric, null::numeric;
    return;
  end if;

  if v_charge.status <> 'pending' or not v_charge.manual_price_override or v_charge.manual_price_original_amount is null then
    return query select false, 'charge_not_overridden', v_charge.amount, v_charge.amount;
    return;
  end if;

  if exists (select 1 from public.payment_allocations where charge_id = p_charge_id)
    or exists (select 1 from public.enrollment_credit_applications where charge_id = p_charge_id) then
    return query select false, 'charge_has_allocations', v_charge.amount, v_charge.amount;
    return;
  end if;

  update public.charges
  set amount = v_charge.manual_price_original_amount,
      pricing_rule_id = v_charge.manual_price_original_pricing_rule_id,
      manual_price_override = false,
      manual_price_override_reason = null,
      manual_price_override_at = null,
      manual_price_override_by = null,
      manual_price_original_amount = null,
      manual_price_original_pricing_rule_id = null,
      updated_at = now()
  where id = p_charge_id;

  return query select true, null::text, v_charge.amount, v_charge.manual_price_original_amount;
end;
$$;

revoke all on function public.restore_unallocated_charge_price(uuid, uuid) from public;
revoke all on function public.restore_unallocated_charge_price(uuid, uuid) from anon;
revoke all on function public.restore_unallocated_charge_price(uuid, uuid) from authenticated;
grant execute on function public.restore_unallocated_charge_price(uuid, uuid) to service_role;

comment on function public.reprice_unallocated_charge(uuid, numeric, uuid, text) is
  'Atomically sets a durable Super Admin manual price override on one pending untouched charge.';
comment on function public.restore_unallocated_charge_price(uuid, uuid) is
  'Atomically restores a pending untouched charge to its exact pre-override amount and pricing rule.';

-- Keep the successful monthly repricing behavior unchanged except for explicitly overridden charges.
create or replace function public.reprice_pending_monthly_tuition(
  p_period_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge_type_id uuid;
  v_updated integer := 0;
begin
  select id into v_charge_type_id
  from public.charge_types
  where code = 'monthly_tuition' and is_active = true
  limit 1;

  if v_charge_type_id is null then
    return jsonb_build_object('error', 'charge_type_missing', 'updated', 0);
  end if;

  with resolved as (
    select
      c.id as charge_id,
      selected_rule.id as pricing_rule_id,
      case
        when coalesce(e.scholarship_status, 'none') = 'custom' then e.custom_scholarship_amount
        when coalesce(e.scholarship_status, 'none') = 'half' then round(selected_rule.amount * 0.5, 2)
        else selected_rule.amount
      end as amount
    from public.charges c
    join public.enrollments e on e.id = c.enrollment_id
    join public.pricing_plans source_plan on source_plan.id = e.pricing_plan_id
    join lateral (
      select pp.id
      from public.pricing_plans pp
      where pp.plan_code = source_plan.plan_code
        and pp.is_active = true
        and pp.effective_start <= p_period_month
        and (pp.effective_end is null or pp.effective_end >= p_period_month)
      order by pp.effective_start desc, pp.updated_at desc
      limit 1
    ) target_plan on true
    join lateral (
      select r.id, r.amount
      from public.pricing_plan_tuition_rules r
      where r.pricing_plan_id = target_plan.id
        and r.day_from <= 11
        and (r.day_to is null or r.day_to >= 11)
      order by r.day_from desc, r.priority asc
      limit 1
    ) selected_rule on true
    where c.charge_type_id = v_charge_type_id
      and c.status = 'pending'
      and c.period_month = p_period_month
      and c.manual_price_override = false
      and coalesce(e.scholarship_status, 'none') <> 'full'
      and not exists (
        select 1 from public.payment_allocations pa where pa.charge_id = c.id
      )
      and not exists (
        select 1 from public.enrollment_credit_applications eca where eca.charge_id = c.id
      )
  )
  update public.charges c
  set amount = resolved.amount,
      pricing_rule_id = resolved.pricing_rule_id,
      updated_at = now()
  from resolved
  where c.id = resolved.charge_id
    and (c.amount is distinct from resolved.amount or c.pricing_rule_id is distinct from resolved.pricing_rule_id);

  get diagnostics v_updated = row_count;

  return jsonb_build_object('updated', v_updated, 'period_month', p_period_month::text);
end;
$$;

revoke execute on function public.reprice_pending_monthly_tuition(date) from public;
revoke execute on function public.reprice_pending_monthly_tuition(date) from anon;
revoke execute on function public.reprice_pending_monthly_tuition(date) from authenticated;
grant execute on function public.reprice_pending_monthly_tuition(date) to service_role;
