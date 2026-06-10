-- Pro-portal schema: consolidated from the original migrations_pre_baseline files.
-- Applied by the PGlite / pg test harnesses on top of ROLES_AUTH_SQL + BASE_SCHEMA_SQL.

-- ============================================================
-- 1. Extend base tables
-- ============================================================

-- providers.merged_into and .plan are intentionally absent from BASE_SCHEMA_SQL
-- so this migration adds them exactly as prod does.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter';

ALTER TABLE public.providers
  ADD CONSTRAINT providers_plan_check CHECK (plan IN ('starter','team','business'));

-- ============================================================
-- 2. Lead contact consents
-- ============================================================

CREATE TABLE public.lead_contact_consents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id          uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  diagnosis_id         uuid REFERENCES public.diagnoses(id) ON DELETE SET NULL,
  channel              text,
  scope                text NOT NULL DEFAULT 'name,phone,enquiry',
  consent_text_version text,
  granted_at           timestamptz NOT NULL DEFAULT now(),
  revoked_at           timestamptz
);

ALTER TABLE public.lead_contact_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_contact_consents_select_own ON public.lead_contact_consents
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY lead_contact_consents_update_own ON public.lead_contact_consents
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 3. Lead states
-- ============================================================

CREATE TABLE public.lead_states (
  contact_event_id uuid PRIMARY KEY REFERENCES public.provider_contact_events(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'new',
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_states_status_check CHECK (status IN ('new','responded','quoted','won','lost'))
);

ALTER TABLE public.lead_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_states_claimed_pro_rw ON public.lead_states
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.provider_contact_events e
    JOIN public.providers p ON p.id = e.provider_id
    WHERE e.id = lead_states.contact_event_id
      AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.provider_contact_events e
    JOIN public.providers p ON p.id = e.provider_id
    WHERE e.id = lead_states.contact_event_id
      AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 4. Provider claims
-- ============================================================

CREATE TABLE public.provider_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT provider_claims_status_check CHECK (status IN ('pending','approved','rejected'))
);

ALTER TABLE public.provider_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_claims_select_own ON public.provider_claims
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- 5. Provider customers
-- ============================================================

CREATE TABLE public.provider_customers (
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

ALTER TABLE public.provider_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_customers_claimed_pro_rw ON public.provider_customers
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_customers.provider_id
      AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_customers.provider_id
      AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 6. Jobs
-- ============================================================

CREATE TABLE public.jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  contact_event_id uuid REFERENCES public.provider_contact_events(id) ON DELETE SET NULL,
  title            text,
  site_address     text,
  status           text NOT NULL DEFAULT 'scheduled',
  scheduled_for    timestamptz,
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_status_check CHECK (status IN ('scheduled','in_progress','completed','cancelled'))
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_claimed_pro_rw ON public.jobs
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = jobs.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = jobs.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 7. Quotes
-- ============================================================

CREATE TABLE public.quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  contact_event_id uuid REFERENCES public.provider_contact_events(id) ON DELETE SET NULL,
  number           text,
  status           text NOT NULL DEFAULT 'draft',
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
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotes_status_check CHECK (status IN ('draft','sent','accepted','declined','expired'))
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_claimed_pro_rw ON public.quotes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = quotes.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = quotes.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

CREATE TABLE public.quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description text,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  line_total  numeric NOT NULL DEFAULT 0,
  position    integer NOT NULL DEFAULT 0
);

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_items_claimed_pro_rw ON public.quote_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.providers p ON p.id = q.provider_id
    WHERE q.id = quote_items.quote_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.providers p ON p.id = q.provider_id
    WHERE q.id = quote_items.quote_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 8. Invoices
-- ============================================================

CREATE TABLE public.provider_document_counters (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  invoice_seq integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_invoice_seq(p_provider uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $$
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

CREATE TABLE public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES public.provider_customers(id) ON DELETE SET NULL,
  quote_id        uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  number          text,
  status          text NOT NULL DEFAULT 'draft',
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
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft','sent','partial','paid','overdue'))
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_claimed_pro_rw ON public.invoices
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = invoices.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = invoices.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

CREATE TABLE public.invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  line_total  numeric NOT NULL DEFAULT 0,
  position    integer NOT NULL DEFAULT 0
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_items_claimed_pro_rw ON public.invoice_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.providers p ON p.id = i.provider_id
    WHERE i.id = invoice_items.invoice_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.providers p ON p.id = i.provider_id
    WHERE i.id = invoice_items.invoice_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

CREATE TABLE public.credit_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount     numeric NOT NULL DEFAULT 0,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_notes_claimed_pro_rw ON public.credit_notes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.providers p ON p.id = i.provider_id
    WHERE i.id = credit_notes.invoice_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.providers p ON p.id = i.provider_id
    WHERE i.id = credit_notes.invoice_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.invoices_block_issued_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    IF NEW.number      IS DISTINCT FROM OLD.number
    OR NEW.subtotal    IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount  IS DISTINCT FROM OLD.vat_amount
    OR NEW.total       IS DISTINCT FROM OLD.total
    OR NEW.issued_at   IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'Issued invoice % is immutable: number, totals and issued_at cannot change (use a credit note)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_block_issued_edits
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_block_issued_edits();

-- ============================================================
-- 9. Provider branding
-- ============================================================

CREATE TABLE public.provider_branding (
  provider_id     uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  logo_url        text,
  accent_color    text,
  banking_details text,
  vat_registered  boolean NOT NULL DEFAULT false,
  vat_number      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_branding_claimed_pro_rw ON public.provider_branding
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_branding.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_branding.provider_id AND p.claimed_by_user_id = (SELECT auth.uid())
  ));

-- ============================================================
-- 10. Provider members
-- ============================================================

CREATE TABLE public.provider_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'member',
  invited_email text,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  status        text NOT NULL DEFAULT 'invited',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_members_role_check   CHECK (role   IN ('owner','admin','member')),
  CONSTRAINT provider_members_status_check CHECK (status IN ('invited','active','removed'))
);

ALTER TABLE public.provider_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_members_read_own_team ON public.provider_members
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_members.provider_id
        AND p.claimed_by_user_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- 11. Unique partial indexes (data-integrity guards)
-- ============================================================

-- One pending claim per provider and per user.
CREATE UNIQUE INDEX provider_claims_one_pending_per_provider
  ON public.provider_claims (provider_id) WHERE status = 'pending';
CREATE UNIQUE INDEX provider_claims_one_pending_per_user
  ON public.provider_claims (user_id) WHERE status = 'pending';

-- One job per originating contact event (when set).
CREATE UNIQUE INDEX jobs_contact_event_uniq
  ON public.jobs (contact_event_id) WHERE contact_event_id IS NOT NULL;

-- One membership row per (provider, user) pair (when user is set).
CREATE UNIQUE INDEX provider_members_provider_user_uniq
  ON public.provider_members (provider_id, user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 12. get_user_id_by_email RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
