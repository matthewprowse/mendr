-- Phase 10 (plan tiers only — billing is not built yet). A provider sits on a
-- plan that gates team seats and service-area reach. Selection is free for now;
-- no payment is taken. See the Pro Portal plan doc, Phase 10.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter'
  CHECK (plan IN ('starter', 'team', 'business'));

COMMENT ON COLUMN public.providers.plan IS 'Subscription tier gating seats and service-area radius. Enforced in app; billing not yet built.';
