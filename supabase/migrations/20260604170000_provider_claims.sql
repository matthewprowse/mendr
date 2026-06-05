-- Phase 4: provider claims go through admin review instead of writing
-- providers.claimed_by_user_id directly. A Pro submits a claim (pending); an
-- admin approves it, which is when claimed_by_user_id is set. This prevents a
-- business being claimed by someone who does not own it.

CREATE TABLE IF NOT EXISTS public.provider_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- At most one pending claim per provider, and one pending claim per user.
CREATE UNIQUE INDEX IF NOT EXISTS provider_claims_one_pending_per_provider
  ON public.provider_claims (provider_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS provider_claims_one_pending_per_user
  ON public.provider_claims (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS provider_claims_status_idx
  ON public.provider_claims (status, created_at DESC);

ALTER TABLE public.provider_claims ENABLE ROW LEVEL SECURITY;

-- A user reads only their own claims. Inserts and reviews happen server-side
-- (service role): the Pro claim endpoint and the admin review endpoint.
CREATE POLICY "provider_claims_select_own"
  ON public.provider_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.provider_claims IS
  'Pending/approved/rejected requests by a Pro to claim a provider listing. Approval sets providers.claimed_by_user_id.';
