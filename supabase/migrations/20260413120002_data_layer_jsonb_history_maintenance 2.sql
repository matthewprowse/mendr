-- JSONB guard on stored diagnosis (NOT VALID for safe rollout), audit snapshots, maintenance RPC for cron.

ALTER TABLE public.diagnoses
    DROP CONSTRAINT IF EXISTS diagnoses_diagnosis_shape_check;

ALTER TABLE public.diagnoses
    ADD CONSTRAINT diagnoses_diagnosis_shape_check
    CHECK (
        diagnosis is null
        OR (
            jsonb_typeof(diagnosis) = 'object'
            AND diagnosis ? 'trade'
            AND diagnosis ? 'urgency_key'
            AND diagnosis ? 'confidence'
        )
    )
    NOT VALID;

COMMENT ON CONSTRAINT diagnoses_diagnosis_shape_check ON public.diagnoses IS
    'Align with app expectations (see diagnosis-json-validate.ts). Run VALIDATE CONSTRAINT after backfill.';

-- ---------------------------------------------------------------------------
-- diagnosis_history: prior row snapshots on UPDATE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.diagnosis_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    diagnosis_id uuid NOT NULL REFERENCES public.diagnoses (id) ON DELETE CASCADE,
    snapshot jsonb NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnosis_history_diagnosis_id_idx ON public.diagnosis_history (diagnosis_id);

CREATE OR REPLACE FUNCTION public.diagnoses_archive_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.diagnosis_history (diagnosis_id, snapshot, changed_at)
    VALUES (
        OLD.id,
        jsonb_build_object(
            'title', OLD.title,
            'image_url', OLD.image_url,
            'diagnosis', OLD.diagnosis,
            'customer_lat', OLD.customer_lat,
            'customer_lng', OLD.customer_lng,
            'customer_address', OLD.customer_address,
            'user_id', OLD.user_id,
            'updated_at', OLD.updated_at
        ),
        now()
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS diagnoses_archive_trg ON public.diagnoses;

CREATE TRIGGER diagnoses_archive_trg
    BEFORE UPDATE ON public.diagnoses
    FOR EACH ROW
    EXECUTE PROCEDURE public.diagnoses_archive_before_update();

-- ---------------------------------------------------------------------------
-- Maintenance: call via Supabase service role RPC (e.g. Vercel cron hitting your API).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_data_layer_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n_stale int;
    n_orphan int;
    n_usage int;
BEGIN
    DELETE FROM public.provider_cache pc
    WHERE pc.enriched_at IS NOT NULL
      AND pc.enriched_at < now() - interval '30 days';
    GET DIAGNOSTICS n_stale = ROW_COUNT;

    DELETE FROM public.provider_cache pc
    WHERE NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.id = pc.provider_id);
    GET DIAGNOSTICS n_orphan = ROW_COUNT;

    DELETE FROM public.diagnosis_usage du
    WHERE du.anonymous_key IS NOT NULL
      AND du.first_seen_at < now() - interval '30 days';
    GET DIAGNOSTICS n_usage = ROW_COUNT;

    RETURN jsonb_build_object(
        'provider_cache_stale_deleted',
        n_stale,
        'provider_cache_orphan_deleted',
        n_orphan,
        'diagnosis_usage_anon_deleted',
        n_usage
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_data_layer_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_data_layer_maintenance() TO service_role;
