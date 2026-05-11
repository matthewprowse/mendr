-- Hot-path indexes and review deduplication aligned with app upsert(onConflict: provider_id,source,source_ref).

CREATE INDEX IF NOT EXISTS providers_google_place_id_idx ON public.providers (google_place_id);

CREATE INDEX IF NOT EXISTS provider_cache_provider_id_idx ON public.provider_cache (provider_id);

CREATE INDEX IF NOT EXISTS provider_cache_provider_id_cache_version_idx
    ON public.provider_cache (provider_id, cache_version);

CREATE INDEX IF NOT EXISTS reviews_provider_id_idx ON public.reviews (provider_id);

-- Replace weaker global uniqueness on (source, source_ref) if present (names vary by environment).
DO $$
DECLARE
    cname text;
BEGIN
    FOR cname IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'reviews'
          AND con.contype = 'u'
          AND pg_get_constraintdef(con.oid) ILIKE '%(source, source_ref)%'
    LOOP
        EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS %I', cname);
    END LOOP;
END $$;

DROP INDEX IF EXISTS reviews_source_source_ref_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_provider_id_source_source_ref_uidx
    ON public.reviews (provider_id, source, source_ref);
