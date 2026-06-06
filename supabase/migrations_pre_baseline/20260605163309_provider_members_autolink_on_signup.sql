-- Phase 8: when a new auth user is created, activate any pending team invites
-- that were addressed to their email, so an invited teammate is linked on their
-- first sign-in.
CREATE OR REPLACE FUNCTION public.link_pending_provider_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.provider_members
  SET user_id = NEW.id,
      status = 'active',
      accepted_at = now(),
      updated_at = now()
  WHERE user_id IS NULL
    AND status = 'invited'
    AND lower(invited_email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_link_provider_members ON auth.users;
CREATE TRIGGER on_auth_user_link_provider_members
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_pending_provider_members();
