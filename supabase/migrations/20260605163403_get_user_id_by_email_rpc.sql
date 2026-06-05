-- Phase 8: resolve an auth user id by email for team invites. SECURITY DEFINER
-- so the service-role invite API can link an already-registered Pro immediately;
-- the on-signup trigger covers users who register later. Not callable by anon or
-- authenticated roles.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
