-- ============================================================
-- Migration: rename conversations → diagnoses, clean providers
-- ============================================================

-- ── 1. Rename conversations table ───────────────────────────
-- The table stores AI diagnosis sessions, not chat conversations.
-- Aligning the name with /api/diagnose, /diagnosis/[id], and
-- the domain language used throughout the app.

ALTER TABLE conversations RENAME TO diagnoses;

-- Rename the primary-key sequence if it exists (Supabase default)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'conversations_id_seq'
    ) THEN
        ALTER SEQUENCE conversations_id_seq RENAME TO diagnoses_id_seq;
    END IF;
END $$;

-- Rename any indexes that reference the old table name
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'diagnoses'
          AND indexname LIKE 'conversations_%'
    LOOP
        EXECUTE format(
            'ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'conversations_', 'diagnoses_')
        );
    END LOOP;
END $$;

-- Update RLS policies that reference the old table name
-- (Supabase stores policy names, not table-scoped automatically)
-- List current policies with: SELECT policyname FROM pg_policies WHERE tablename = 'diagnoses';
-- Re-create any policies that referenced 'conversations' by name after verifying in dashboard.


-- ── 2. Clean providers table ────────────────────────────────
-- Drop columns that are either 0% populated, contain garbage
-- Google Place type labels, or are computed elsewhere.

-- Google Place type labels — meaningless data like
-- [{"full":"Service","short":"Service"}]. Replaced by enrichment
-- specialisations which contain real service descriptions.
ALTER TABLE providers DROP COLUMN IF EXISTS services;
ALTER TABLE providers DROP COLUMN IF EXISTS service_categories;

-- 0% populated — never written to
ALTER TABLE providers DROP COLUMN IF EXISTS review_categories;
ALTER TABLE providers DROP COLUMN IF EXISTS opening_hours;
ALTER TABLE providers DROP COLUMN IF EXISTS profile_id;
ALTER TABLE providers DROP COLUMN IF EXISTS slug;

-- 7% populated — open/closed status is computed at runtime
-- from weekday_descriptions via isOpenNowFromWeekdayDescriptions()
ALTER TABLE providers DROP COLUMN IF EXISTS open_now;


-- ── 3. Clean provider_cache table ───────────────────────────
-- Drop columns that are unused in display, unreliable, or debug-only.

-- 2% populated — image sync to storage bucket is not working
ALTER TABLE provider_cache DROP COLUMN IF EXISTS images;
ALTER TABLE provider_cache DROP COLUMN IF EXISTS has_work_photos;

-- 20% populated but Gemini frequently hallucinates this value
-- (values of 72 and 109 years were observed in production data)
ALTER TABLE provider_cache DROP COLUMN IF EXISTS years_experience;

-- 7% populated — not displayed anywhere in the UI
ALTER TABLE provider_cache DROP COLUMN IF EXISTS certifications;

-- Debug data — first 8,000 chars of raw website text scraped per
-- enrichment cycle. Should never have been persisted permanently.
ALTER TABLE provider_cache DROP COLUMN IF EXISTS raw_scrape_text;

-- 65% populated but never surfaced to users or used in scoring.
-- Generated as a 1-sentence response style descriptor that had
-- no integration point.
ALTER TABLE provider_cache DROP COLUMN IF EXISTS response_profile;
