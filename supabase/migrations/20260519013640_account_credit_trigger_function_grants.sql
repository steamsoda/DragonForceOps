-- Trigger-only validation helpers should not be callable through PostgREST RPC.

revoke execute on function public.validate_enrollment_credit() from public;
revoke execute on function public.validate_enrollment_credit() from anon;
revoke execute on function public.validate_enrollment_credit() from authenticated;

revoke execute on function public.validate_enrollment_credit_application() from public;
revoke execute on function public.validate_enrollment_credit_application() from anon;
revoke execute on function public.validate_enrollment_credit_application() from authenticated;
