-- Cached, researched cost estimates per taxonomy subcategory. Populated by a
-- deliberate Brave-search + LLM research step (never on page views), so the
-- read path is a cheap DB lookup. Falls back to the static estimates in code
-- until a row exists. Cost is non-sensitive and shown to homeowners, so reads
-- are public; writes go through the service-role research pipeline only.
CREATE TABLE IF NOT EXISTS public.cost_estimates (
  subcategory_id text PRIMARY KEY,
  min_zar        integer,
  max_zar        integer,            -- null = open-ended ("from R min")
  unit           text,
  note           text,
  source         text NOT NULL DEFAULT 'brave'
                 CHECK (source IN ('brave', 'seed', 'manual')),
  research_query text,
  researched_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_estimates_public_read" ON public.cost_estimates
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE public.cost_estimates IS 'Researched cost ranges per fault type, refreshed via Brave + LLM on a deliberate trigger and cached. Read path falls back to static estimates in code.';
