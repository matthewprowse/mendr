-- Phase 6: quotes. A Pro builds a quote (line items, VAT, deposit, validity,
-- terms), pre-filled from a lead, shares it as a tracked link, and converts it
-- to an invoice on acceptance. provider_branding holds the light branding the
-- quote/invoice renders with.

CREATE TABLE IF NOT EXISTS public.quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  contact_event_id uuid REFERENCES public.provider_contact_events(id) ON DELETE SET NULL,
  number           text,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  subtotal         numeric NOT NULL DEFAULT 0,
  vat_amount       numeric NOT NULL DEFAULT 0,
  total            numeric NOT NULL DEFAULT 0,
  deposit_percent  numeric,
  valid_until      date,
  terms            text,
  template         text NOT NULL DEFAULT 'classic',
  sent_at          timestamptz,
  viewed_at        timestamptz,
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description text,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  line_total  numeric NOT NULL DEFAULT 0,
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.provider_branding (
  provider_id     uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  logo_url        text,
  accent_color    text,
  banking_details text,
  vat_registered  boolean NOT NULL DEFAULT false,
  vat_number      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_provider_idx ON public.quotes (provider_id);
CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON public.quote_items (quote_id);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_claimed_pro_rw"
  ON public.quotes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = quotes.provider_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = quotes.provider_id AND p.claimed_by_user_id = auth.uid()));

CREATE POLICY "quote_items_claimed_pro_rw"
  ON public.quote_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q JOIN public.providers p ON p.id = q.provider_id
    WHERE q.id = quote_items.quote_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q JOIN public.providers p ON p.id = q.provider_id
    WHERE q.id = quote_items.quote_id AND p.claimed_by_user_id = auth.uid()));

CREATE POLICY "provider_branding_claimed_pro_rw"
  ON public.provider_branding FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_branding.provider_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_branding.provider_id AND p.claimed_by_user_id = auth.uid()));

COMMENT ON TABLE public.quotes IS 'Pro quotes with line items (quote_items), VAT, deposit, validity, terms. Shared as a tracked link; converts to an invoice on acceptance.';
