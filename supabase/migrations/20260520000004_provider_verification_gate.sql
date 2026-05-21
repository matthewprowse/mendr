-- Add is_verified to providers and tighten the public select policy.
--
-- Google-sourced providers are already trusted (enrichment pipeline validates them).
-- Application-sourced providers must be manually verified by an admin before appearing
-- on the /matches page.

ALTER TABLE public.providers
    ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.is_verified IS
    'For google-sourced providers this is backfilled to true. For application-sourced providers, '
    'an admin must set this to true before the provider is shown to homeowners.';

-- Backfill: all existing Google providers are considered verified.
UPDATE public.providers
    SET is_verified = true
    WHERE source = 'google';

-- Drop the old permissive policy and replace with source-aware gate.
DROP POLICY IF EXISTS providers_public_select ON public.providers;

CREATE POLICY providers_public_select
    ON public.providers
    FOR SELECT
    TO anon, authenticated
    USING (
        COALESCE(is_active, true)
        AND (source = 'google' OR is_verified = true)
    );
