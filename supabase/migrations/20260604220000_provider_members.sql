-- Phase 8: team and roles. A provider can have multiple Pro users. The first
-- claimer is the owner; owners and admins manage the team, billing and
-- settings; members work assigned leads and jobs. Invites are by email and
-- linked to a Supabase account on first matching login.

CREATE TABLE IF NOT EXISTS public.provider_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'admin', 'member')),
  invited_email text,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  status        text NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'active', 'removed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_members_provider_idx ON public.provider_members (provider_id);
CREATE INDEX IF NOT EXISTS provider_members_user_idx ON public.provider_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS provider_members_provider_user_uniq
  ON public.provider_members (provider_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_members_invited_email_idx
  ON public.provider_members (lower(invited_email)) WHERE invited_email IS NOT NULL;

-- Backfill: every currently-claimed provider gets its claimer as the owner.
INSERT INTO public.provider_members (provider_id, user_id, role, status, accepted_at)
SELECT p.id, p.claimed_by_user_id, 'owner', 'active', now()
FROM public.providers p
WHERE p.claimed_by_user_id IS NOT NULL
  AND p.merged_into IS NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.provider_members ENABLE ROW LEVEL SECURITY;

-- Avoid self-reference (infinite recursion). Owner reads via claimed_by_user_id;
-- members read their own row. Team rosters are served through service-role APIs.
CREATE POLICY "provider_members_read_own_team" ON public.provider_members FOR SELECT TO authenticated
  USING (
    provider_members.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_members.provider_id AND p.claimed_by_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.provider_members IS 'Pro team membership. Owner (first claimer), admin, or member. Writes go through service-role APIs that gate on role.';

-- When a new auth user is created, activate any pending team invites addressed
-- to their email.
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

-- Resolve an auth user id by email so the invite API can link an
-- already-registered Pro immediately; the trigger above covers later signups.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
