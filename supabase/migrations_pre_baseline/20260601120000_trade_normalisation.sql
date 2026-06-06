-- Trade normalisation: first-class canonical primary_trade on diagnoses.
-- See docs/expansions "Trade Normalisation Breakdown". The diagnosis jsonb keeps
-- the raw/secondary trade and detail; primary_trade is the canonical first-tier
-- trade (one of the 23 SERVICE_LABELS) used by stats and matching.

ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS primary_trade text;

-- Returns the diagnosis trade only when it already matches one of the 23 canonical
-- labels (case-insensitive), else NULL. New diagnoses are coerced to canonical
-- upstream; messy legacy values return NULL and are handled by a one-off backfill.
CREATE OR REPLACE FUNCTION public.canonical_primary_trade(diag jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT t.label
    FROM (VALUES
        ('Electrical'),('Plumbing'),('Security'),('Building & Construction'),
        ('Carpentry & Woodwork'),('Flooring & Tiling'),('Garden & Landscaping'),
        ('General Handyman'),('Locksmith Services'),('Painting'),('Pool Maintenance'),
        ('Rubble & Waste Removal'),('Welding'),('Appliance Repair'),('Air Conditioning'),
        ('Glazing, Glass & Aluminium'),('Borehole, Water & Pumps'),('Pest Control'),
        ('Waterproofing'),('Solar & Backup Power'),('Roofing'),('Paving & Driveways'),
        ('Gas Installation & Repair')
    ) AS t(label)
    WHERE lower(t.label) = lower(NULLIF(trim(diag ->> 'trade'), ''))
    LIMIT 1;
$$;

-- Keep primary_trade in sync on every write path. COALESCE preserves a previously
-- backfilled value when an unrelated update carries a non-canonical legacy string.
CREATE OR REPLACE FUNCTION public.set_primary_trade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.primary_trade := COALESCE(public.canonical_primary_trade(NEW.diagnosis), NEW.primary_trade);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_primary_trade ON public.diagnoses;
CREATE TRIGGER trg_set_primary_trade
BEFORE INSERT OR UPDATE OF diagnosis ON public.diagnoses
FOR EACH ROW EXECUTE FUNCTION public.set_primary_trade();

-- Platform stats: trades_covered now counts distinct canonical primary_trade.
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
            SELECT count(DISTINCT primary_trade) FROM committed WHERE primary_trade IS NOT NULL
        ),
        'providers_active', (
            SELECT count(*) FROM public.providers WHERE is_active = true
        )
    );
$$;
