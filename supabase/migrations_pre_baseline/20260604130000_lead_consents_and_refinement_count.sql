-- Phase 2 of the Homeowner Onboarding And Pro Portal Plan.
--
-- 1. lead_contact_consents: the per-contact consent audit trail and the switch
--    that controls whether a Pro may see a homeowner's identity. A row is
--    written at the moment the homeowner confirms the consent gate, before any
--    message is sent. revoked_at flips it off. consent_text_version records
--    exactly what wording they agreed to (provable consent).
-- 2. diagnoses.refinement_count: backs the per-diagnosis refinement fair-use cap
--    (10 user-initiated refinements). Wiring in /api/diagnose is added later.

CREATE TABLE IF NOT EXISTS public.lead_contact_consents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id          uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  diagnosis_id         uuid REFERENCES public.diagnoses(id) ON DELETE SET NULL,
  channel              text CHECK (channel IN ('phone', 'email', 'whatsapp')),
  scope                text NOT NULL DEFAULT 'name,phone,enquiry',
  consent_text_version text,
  granted_at           timestamptz NOT NULL DEFAULT now(),
  revoked_at           timestamptz
);

CREATE INDEX IF NOT EXISTS lead_contact_consents_user_idx
  ON public.lead_contact_consents (user_id);
CREATE INDEX IF NOT EXISTS lead_contact_consents_provider_active_idx
  ON public.lead_contact_consents (provider_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.lead_contact_consents ENABLE ROW LEVEL SECURITY;

-- A homeowner reads and revokes only their own consents. Inserts happen
-- server-side (service role) at the contact gate, so no INSERT policy for
-- authenticated users. Pro-side reads go through the service role until the Pro
-- portal lands with its own membership-scoped policies.
CREATE POLICY "lead_contact_consents_select_own"
  ON public.lead_contact_consents
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "lead_contact_consents_update_own"
  ON public.lead_contact_consents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.lead_contact_consents IS
  'Per-contact consent audit + the switch controlling whether a Pro may see homeowner identity. Written at the consent gate; revoked_at disables it.';

ALTER TABLE public.diagnoses
  ADD COLUMN IF NOT EXISTS refinement_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.diagnoses.refinement_count IS
  'Count of user-initiated Refine actions (changed photos/added text). Capped at 10. AI clarifications and warm-up/hydration calls do not count.';