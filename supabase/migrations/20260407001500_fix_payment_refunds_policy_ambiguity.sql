-- Fix ambiguous column references in payment_refunds RLS policies.

drop policy if exists front_desk_read_payment_refunds on public.payment_refunds;
create policy front_desk_read_payment_refunds on public.payment_refunds
  for select to authenticated
  using (
    public.is_front_desk()
    and public.current_user_can_access_payment(public.payment_refunds.payment_id)
  );

drop policy if exists front_desk_insert_payment_refunds on public.payment_refunds;
create policy front_desk_insert_payment_refunds on public.payment_refunds
  for insert to authenticated
  with check (
    public.is_front_desk()
    and public.current_user_can_access_payment(public.payment_refunds.payment_id)
    and public.current_user_can_access_enrollment(public.payment_refunds.enrollment_id)
    and public.can_access_campus(public.payment_refunds.operator_campus_id)
  );
