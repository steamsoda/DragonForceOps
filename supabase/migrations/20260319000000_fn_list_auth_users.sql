-- Function for superadmin to list all auth users without needing the service role key.
-- SECURITY DEFINER runs as postgres (owner), so it can read auth.users.
-- App layer is responsible for verifying superadmin role before calling.

CREATE OR REPLACE FUNCTION public.list_auth_users()
RETURNS TABLE(
  id uuid,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT id, email::text, last_sign_in_at, created_at
  FROM auth.users
  ORDER BY created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_auth_users() TO authenticated;
