-- Phase 5b: jobs — the work-order entity between a won lead and an invoice.
-- A won lead (or, later, an accepted quote) becomes a job with scheduling, a
-- site address, and an assigned team member. Invoicing comes off a job.

CREATE TABLE IF NOT EXISTS public.jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  contact_event_id uuid REFERENCES public.provider_contact_events(id) ON DELETE SET NULL,
  title            text,
  site_address     text,
  status           text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_for    timestamptz,
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_provider_idx ON public.jobs (provider_id);
-- One job per originating lead, so marking a lead won twice does not duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_contact_event_uniq
  ON public.jobs (contact_event_id) WHERE contact_event_id IS NOT NULL;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_claimed_pro_rw"
  ON public.jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = jobs.provider_id AND p.claimed_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = jobs.provider_id AND p.claimed_by_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.jobs IS
  'Work orders. A won lead (or accepted quote) becomes a job with scheduling, site address, and assignment. Invoices reference a job.';
