-- Phase 5: provider_customers — the Pro's CRM. One record per identified
-- homeowner the Pro has dealt with, auto-seeded from consented leads and added
-- to manually for off-platform customers. Quotes, invoices, and jobs reference
-- this.
--
-- UNIQUE (provider_id, homeowner_user_id) dedupes Mendr-account customers; with
-- NULLS DISTINCT (Postgres default) many manually-added rows (null user) are
-- allowed per provider.

CREATE TABLE IF NOT EXISTS public.provider_customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  homeowner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name              text,
  phone             text,
  email             text,
  address           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, homeowner_user_id)
);

CREATE INDEX IF NOT EXISTS provider_customers_provider_idx
  ON public.provider_customers (provider_id);

ALTER TABLE public.provider_customers ENABLE ROW LEVEL SECURITY;

-- A Pro reads and writes customers only for a provider they have claimed.
CREATE POLICY "provider_customers_claimed_pro_rw"
  ON public.provider_customers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_customers.provider_id
        AND p.claimed_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_customers.provider_id
        AND p.claimed_by_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.provider_customers IS
  'Pro CRM: one row per identified homeowner the Pro has dealt with. Auto-seeded from consented leads, plus manual adds.';
