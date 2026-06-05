-- Phase 7: invoices. Created from an accepted quote / completed job or
-- standalone. Editable while draft; locked once issued, with a gap-free
-- per-Pro number assigned at issue time. Corrections go through credit_notes.

CREATE TABLE IF NOT EXISTS public.provider_document_counters (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  invoice_seq integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  quote_id        uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  number          text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue')),
  subtotal        numeric NOT NULL DEFAULT 0,
  vat_amount      numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  amount_paid     numeric NOT NULL DEFAULT 0,
  deposit_percent numeric,
  due_date        date,
  terms           text,
  template        text NOT NULL DEFAULT 'classic',
  issued_at       timestamptz,
  sent_at         timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  line_total  numeric NOT NULL DEFAULT 0,
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount              numeric NOT NULL DEFAULT 0,
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_provider_idx ON public.invoices (provider_id);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items (invoice_id);

-- Atomic gap-free next invoice number per provider.
CREATE OR REPLACE FUNCTION public.next_invoice_seq(p_provider uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.provider_document_counters (provider_id, invoice_seq)
  VALUES (p_provider, 1)
  ON CONFLICT (provider_id)
  DO UPDATE SET invoice_seq = public.provider_document_counters.invoice_seq + 1
  RETURNING invoice_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_document_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_claimed_pro_rw" ON public.invoices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = invoices.provider_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = invoices.provider_id AND p.claimed_by_user_id = auth.uid()));

CREATE POLICY "invoice_items_claimed_pro_rw" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.providers p ON p.id = i.provider_id WHERE i.id = invoice_items.invoice_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i JOIN public.providers p ON p.id = i.provider_id WHERE i.id = invoice_items.invoice_id AND p.claimed_by_user_id = auth.uid()));

CREATE POLICY "credit_notes_claimed_pro_rw" ON public.credit_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.providers p ON p.id = i.provider_id WHERE i.id = credit_notes.invoice_id AND p.claimed_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i JOIN public.providers p ON p.id = i.provider_id WHERE i.id = credit_notes.invoice_id AND p.claimed_by_user_id = auth.uid()));

COMMENT ON TABLE public.invoices IS 'Pro invoices. Editable while draft; locked on issue with a gap-free per-Pro number. Corrections via credit_notes.';
