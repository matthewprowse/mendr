-- Enrichment review queue: flag rows whose LLM output failed the leak gate
-- (CSS / HTML / structural junk) so admins can re-review or re-enrich them.

ALTER TABLE public.providers
    ADD COLUMN IF NOT EXISTS enrichment_review_required boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS enrichment_last_failure text,
    ADD COLUMN IF NOT EXISTS enrichment_last_failure_at timestamptz;

COMMENT ON COLUMN public.providers.enrichment_review_required IS
    'True when the LLM enrichment output (about/past_work/bio/customer_review_summary) failed the content-leak gate after retries; admins should review.';
COMMENT ON COLUMN public.providers.enrichment_last_failure IS
    'Free-form summary of the last guard rejection (e.g. ''about_business: css'').';
COMMENT ON COLUMN public.providers.enrichment_last_failure_at IS
    'Timestamp of the last guard rejection.';

CREATE INDEX IF NOT EXISTS providers_enrichment_review_required_idx
    ON public.providers (enrichment_review_required)
    WHERE enrichment_review_required = true;
