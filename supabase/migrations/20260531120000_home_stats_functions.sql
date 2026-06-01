-- Home dashboard stats: platform-wide + per-user aggregates.
--
-- Centralises the "first-pass accuracy" definition in one place so the home
-- page, the public marketing-stats endpoint, and any future caller agree.
--
-- A diagnosis is "committed" when it produced a real diagnosis (not rejected,
-- not unserviced). It is "first-pass correct" when the homeowner did not have
-- to clarify or refine it: clarification_round is 0/null, requires_clarification
-- is not true, and image_refinement_log is empty. This is a behavioural proxy
-- for accuracy — Mendr does not capture confirmed outcomes yet.

CREATE OR REPLACE FUNCTION public.diagnosis_is_committed(d public.diagnoses)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT d.diagnosis IS NOT NULL
        AND COALESCE((d.diagnosis ->> 'rejected')::boolean, false) = false
        AND COALESCE((d.diagnosis ->> 'unserviced')::boolean, false) = false;
$$;

CREATE OR REPLACE FUNCTION public.diagnosis_is_first_pass(d public.diagnoses)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT public.diagnosis_is_committed(d)
        AND COALESCE(d.clarification_round, 0) = 0
        AND COALESCE(d.requires_clarification, false) = false
        AND COALESCE(
            jsonb_typeof(d.image_refinement_log) = 'array'
                AND jsonb_array_length(d.image_refinement_log) > 0,
            false
        ) = false;
$$;

-- Platform-wide trust stats. Safe to expose aggregate counts publicly.
CREATE OR REPLACE FUNCTION public.platform_home_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH committed AS (
        SELECT d.*, public.diagnosis_is_first_pass(d) AS first_pass
        FROM public.diagnoses d
        WHERE public.diagnosis_is_committed(d)
    )
    SELECT json_build_object(
        'committed_total', (SELECT count(*) FROM committed),
        'first_pass_correct', (SELECT count(*) FROM committed WHERE first_pass),
        'first_pass_pct', (
            SELECT CASE WHEN count(*) = 0 THEN 0
                ELSE round(100.0 * count(*) FILTER (WHERE first_pass) / count(*))
            END
            FROM committed
        ),
        'avg_confidence', (
            SELECT COALESCE(round(avg(NULLIF(diagnosis ->> 'confidence', '')::int)), 0)
            FROM committed
        ),
        'trades_covered', (
            SELECT count(DISTINCT NULLIF(trim(diagnosis ->> 'trade'), ''))
            FROM committed
        ),
        'providers_active', (
            SELECT count(*) FROM public.providers WHERE is_active = true
        )
    );
$$;

-- Per-user stats for the home "Your activity" section.
CREATE OR REPLACE FUNCTION public.user_home_stats(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH mine AS (
        SELECT
            d.id,
            d.title,
            d.diagnosis,
            d.customer_address,
            d.created_at,
            public.diagnosis_is_committed(d) AS committed,
            public.diagnosis_is_first_pass(d) AS first_pass
        FROM public.diagnoses d
        WHERE d.user_id = p_user_id
    ),
    committed AS (
        SELECT * FROM mine WHERE committed
    )
    SELECT json_build_object(
        'total', (SELECT count(*) FROM mine),
        'committed_total', (SELECT count(*) FROM committed),
        'first_pass_correct', (SELECT count(*) FROM committed WHERE first_pass),
        'first_pass_pct', (
            SELECT CASE WHEN count(*) = 0 THEN 0
                ELSE round(100.0 * count(*) FILTER (WHERE first_pass) / count(*))
            END
            FROM committed
        ),
        'by_trade', COALESCE((
            SELECT json_agg(t)
            FROM (
                SELECT COALESCE(NULLIF(trim(diagnosis ->> 'trade'), ''), 'Other') AS trade,
                       count(*) AS count
                FROM committed
                GROUP BY 1
                ORDER BY count(*) DESC
                LIMIT 6
            ) t
        ), '[]'::json),
        'recent', (
            SELECT json_build_object(
                'id', id,
                'title', COALESCE(NULLIF(trim(diagnosis ->> 'diagnosis'), ''), title, 'Untitled Diagnosis'),
                'trade', COALESCE(NULLIF(trim(diagnosis ->> 'trade_detail'), ''), NULLIF(trim(diagnosis ->> 'trade'), '')),
                'customer_address', customer_address,
                'created_at', created_at
            )
            FROM mine
            ORDER BY created_at DESC
            LIMIT 1
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.platform_home_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_home_stats(uuid) TO authenticated, service_role;
