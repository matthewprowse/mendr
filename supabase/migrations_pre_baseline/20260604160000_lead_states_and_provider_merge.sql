-- Phase 4 of the Homeowner Onboarding And Pro Portal Plan.
--
-- 1. lead_states: per-lead pipeline status, assignment, and notes. Keyed to the
--    contact event so the immutable event log is never mutated. assigned_to is
--    introduced now (used by Team in Phase 8) so the schema does not change later.
-- 2. providers.merged_into: points a duplicate scraped provider row at the
--    canonical one, so a claimed Pro's leads never split across duplicates.

CREATE TABLE IF NOT EXISTS public.lead_states (
  contact_event_id uuid PRIMARY KEY
    REFERENCES public.provider_contact_events(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'new'
             CHECK (status IN ('new', 'responded', 'quoted', 'won', 'lost')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_states ENABLE ROW LEVEL SECURITY;

-- A Pro reads and writes lead state only for leads on a provider they have
-- claimed. Server-side portal code uses the service role (bypasses RLS); this
-- policy is the guard for any direct authenticated access.
CREATE POLICY "lead_states_claimed_pro_rw"
  ON public.lead_states
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.provider_contact_events e
      JOIN public.providers p ON p.id = e.provider_id
      WHERE e.id = lead_states.contact_event_id
        AND p.claimed_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.provider_contact_events e
      JOIN public.providers p ON p.id = e.provider_id
      WHERE e.id = lead_states.contact_event_id
        AND p.claimed_by_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.lead_states IS
  'Per-lead pipeline status, assignment, and notes, keyed to provider_contact_events. The event log itself is never mutated.';

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.providers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.providers.merged_into IS
  'Set on a duplicate scraped row to point at the canonical provider, so claims and leads consolidate onto one record.';
