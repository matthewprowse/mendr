-- Match filters v2: structured company size, years in business, certifications.
-- Backs the Airbnb-style filter panel on /match.

ALTER TABLE public.providers
    ADD COLUMN IF NOT EXISTS company_size text
        CHECK (company_size IS NULL OR company_size IN ('solo', 'small', 'mid', 'large')),
    ADD COLUMN IF NOT EXISTS company_size_source text
        CHECK (company_size_source IS NULL OR company_size_source IN ('admin', 'enrichment', 'application')),
    ADD COLUMN IF NOT EXISTS years_in_business int
        CHECK (years_in_business IS NULL OR (years_in_business >= 0 AND years_in_business <= 200)),
    ADD COLUMN IF NOT EXISTS years_in_business_source text
        CHECK (years_in_business_source IS NULL OR years_in_business_source IN ('admin', 'enrichment', 'application'));

COMMENT ON COLUMN public.providers.company_size IS 'Bucketed team size: solo (1), small (2-5), mid (6-20), large (20+). Filled by enrichment or admin.';
COMMENT ON COLUMN public.providers.company_size_source IS 'Provenance of company_size; admin overrides are sticky and never overwritten by enrichment.';
COMMENT ON COLUMN public.providers.years_in_business IS 'Years operating, derived from website/scrape (Gemini) or admin override.';
COMMENT ON COLUMN public.providers.years_in_business_source IS 'Provenance of years_in_business; admin overrides are sticky.';

CREATE INDEX IF NOT EXISTS providers_company_size_idx
    ON public.providers (company_size)
    WHERE company_size IS NOT NULL;

CREATE INDEX IF NOT EXISTS providers_years_in_business_idx
    ON public.providers (years_in_business)
    WHERE years_in_business IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.provider_certifications (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id  uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    slug         text NOT NULL,
    label        text NOT NULL,
    issuer       text,
    source       text NOT NULL CHECK (source IN ('admin', 'enrichment', 'application')),
    verified_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, slug)
);

COMMENT ON TABLE public.provider_certifications IS 'Structured certifications for filter chips; admin source is sticky vs enrichment writes.';
COMMENT ON COLUMN public.provider_certifications.slug IS 'Stable slug (e.g. ecb_registered) keyed against app/src/lib/certifications/catalog.ts.';

CREATE INDEX IF NOT EXISTS provider_certifications_provider_id_idx
    ON public.provider_certifications (provider_id);

CREATE INDEX IF NOT EXISTS provider_certifications_slug_idx
    ON public.provider_certifications (slug);

ALTER TABLE public.provider_certifications ENABLE ROW LEVEL SECURITY;
