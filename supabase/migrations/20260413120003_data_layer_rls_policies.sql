-- Row-level security aligned with app roles: browser uses anon/authenticated JWT; APIs use service_role (bypasses RLS).

-- ---------------------------------------------------------------------------
-- Drop existing policies we replace (idempotent re-run in dev).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'diagnoses',
              'providers',
              'reviews',
              'services',
              'diagnosis_history'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- diagnoses — UUID-based sessions; permissive for anon/authenticated (matches prior open access).
-- ---------------------------------------------------------------------------

ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

CREATE POLICY diagnoses_select_anon ON public.diagnoses FOR SELECT TO anon USING (true);

CREATE POLICY diagnoses_insert_anon ON public.diagnoses FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY diagnoses_update_anon ON public.diagnoses FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY diagnoses_delete_anon ON public.diagnoses FOR DELETE TO anon USING (true);

CREATE POLICY diagnoses_select_authenticated ON public.diagnoses FOR SELECT TO authenticated USING (true);

CREATE POLICY diagnoses_insert_authenticated ON public.diagnoses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY diagnoses_update_authenticated ON public.diagnoses FOR UPDATE TO authenticated USING (true)
WITH CHECK (true);

CREATE POLICY diagnoses_delete_authenticated ON public.diagnoses FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- providers — public read of active rows only
-- ---------------------------------------------------------------------------

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY providers_public_select ON public.providers FOR SELECT TO anon, authenticated USING (COALESCE(is_active, true));

-- ---------------------------------------------------------------------------
-- reviews — read only for active providers
-- ---------------------------------------------------------------------------

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_public_select ON public.reviews FOR SELECT TO anon, authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = reviews.provider_id
          AND COALESCE(p.is_active, true)
    )
);

-- ---------------------------------------------------------------------------
-- services — catalog labels are public
-- ---------------------------------------------------------------------------

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_public_select ON public.services FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- messages — chat/report hydration (optional table; skip if absent)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    pol record;
BEGIN
    IF to_regclass('public.messages') IS NOT NULL THEN
        ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
        FOR pol IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'messages'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', pol.policyname);
        END LOOP;
        CREATE POLICY messages_all_anon ON public.messages FOR ALL TO anon USING (true) WITH CHECK (true);
        CREATE POLICY messages_all_authenticated ON public.messages FOR ALL TO authenticated USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- diagnosis_history — no direct client access (writes via trigger as table owner)
-- ---------------------------------------------------------------------------

ALTER TABLE public.diagnosis_history ENABLE ROW LEVEL SECURITY;

-- Intentionally no SELECT/INSERT policies for anon/authenticated.

-- ---------------------------------------------------------------------------
-- Server-only tables — RLS on, no policies for anon/authenticated
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.provider_search_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.diagnosis_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.diagnosis_events ENABLE ROW LEVEL SECURITY;

-- market_rates_cache: RLS already enabled in prior migration; keep deny-by-default for JWT roles.
