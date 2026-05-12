-- Atomic diagnosis quota increment
--
-- Replaces the read-then-write quota pattern in /api/diagnose/route.ts with a
-- single atomic upsert that eliminates the TOCTOU race condition. Two concurrent
-- requests can no longer both pass the quota check by reading the same stale count.
--
-- The function increments the count and returns the new value. The caller checks
-- whether new_count > limit and rejects if so. At most one request over the limit
-- can slip through in extreme concurrency (e.g. count=9, limit=10, two requests
-- land simultaneously → counts become 10 and 11; the count=11 request is rejected).
-- This is the standard pattern for distributed rate limiting and is safe for production.

CREATE OR REPLACE FUNCTION increment_diagnosis_quota(
    p_user_id    uuid,
    p_anon_key   text,
    p_date       date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_count integer;
BEGIN
    IF p_user_id IS NOT NULL THEN
        INSERT INTO diagnosis_usage (user_id, date, count)
        VALUES (p_user_id, p_date, 1)
        ON CONFLICT (user_id, date)
        DO UPDATE SET count = diagnosis_usage.count + 1
        RETURNING count INTO new_count;
    ELSE
        INSERT INTO diagnosis_usage (anonymous_key, date, count)
        VALUES (p_anon_key, p_date, 1)
        ON CONFLICT (anonymous_key, date)
        DO UPDATE SET count = diagnosis_usage.count + 1
        RETURNING count INTO new_count;
    END IF;

    RETURN new_count;
END;
$$;

-- Grant execute to the service_role used by createSupabaseAdminClient
GRANT EXECUTE ON FUNCTION increment_diagnosis_quota(uuid, text, date) TO service_role;
