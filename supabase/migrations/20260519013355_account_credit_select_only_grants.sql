-- Tighten account credit grants after creating the read-only ledger layer.
-- RLS already exposes SELECT-only policies, but this keeps table privileges
-- aligned with the intended read-only Phase 2 surface.

revoke all on table public.enrollment_credits from public, anon, authenticated;
revoke all on table public.enrollment_credit_applications from public, anon, authenticated;
revoke all on table public.v_enrollment_credit_balances from public, anon, authenticated;
revoke all on table public.v_enrollment_credit_events from public, anon, authenticated;

grant select on table public.enrollment_credits to authenticated;
grant select on table public.enrollment_credit_applications to authenticated;
grant select on table public.v_enrollment_credit_balances to authenticated;
grant select on table public.v_enrollment_credit_events to authenticated;
