-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clarification_questions support
-- Date:      2026-04-17
--
-- The `clarification_questions` field is stored inside the existing `diagnosis`
-- JSONB column on the `diagnoses` table (as part of DiagnosisData). No new
-- column is required for the feature to work.
--
-- This migration adds:
--   1. A generated (computed) column `requires_clarification` for fast filtering
--      without a full JSONB scan.
--   2. An index on that column so analytics / admin queries are cheap.
--   3. A generated column `clarification_question_count` for monitoring how
--      often the AI needs to ask follow-up questions.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Generated column: easy boolean flag derived from the JSONB diagnosis blob.
--    STORED means it is computed on write and kept on disk (no runtime cost to
--    read it, unlike a virtual column).
ALTER TABLE diagnoses
  ADD COLUMN IF NOT EXISTS requires_clarification boolean
    GENERATED ALWAYS AS (
      (diagnosis ->> 'requires_clarification')::boolean
    ) STORED;

-- 2. Partial index: only index rows that needed clarification (typically <20% of
--    diagnoses). Keeps the index small and fast.
CREATE INDEX IF NOT EXISTS idx_diagnoses_requires_clarification
  ON diagnoses (requires_clarification)
  WHERE requires_clarification = true;

-- 3. Generated column: count of clarification chips returned by the model.
--    Useful for monitoring prompt quality — a high average means prompts are
--    under-specified or images are frequently ambiguous.
ALTER TABLE diagnoses
  ADD COLUMN IF NOT EXISTS clarification_question_count integer
    GENERATED ALWAYS AS (
      jsonb_array_length(
        COALESCE(diagnosis -> 'clarification_questions', '[]'::jsonb)
      )
    ) STORED;

-- 4. Partial index: find diagnoses where clarification questions were generated.
CREATE INDEX IF NOT EXISTS idx_diagnoses_has_clarification_questions
  ON diagnoses (clarification_question_count)
  WHERE clarification_question_count > 0;

-- 5. Convenience view for analytics: how often do we ask for clarification, and
--    how many chips do we generate?  Useful during prompt iteration.
CREATE OR REPLACE VIEW diagnosis_clarification_stats AS
SELECT
  date_trunc('day', created_at)       AS day,
  count(*)                            AS total_diagnoses,
  count(*) FILTER (WHERE requires_clarification = true)
                                      AS needs_clarification,
  round(
    100.0 * count(*) FILTER (WHERE requires_clarification = true) / nullif(count(*), 0),
    1
  )                                   AS clarification_pct,
  round(avg(clarification_question_count) FILTER (WHERE clarification_question_count > 0), 2)
                                      AS avg_chips_when_needed
FROM diagnoses
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON COLUMN diagnoses.requires_clarification IS
  'Derived from diagnosis JSONB. True when the AI returned requires_clarification=true (confidence < 85 or ambiguous image). Used for analytics and filtering.';

COMMENT ON COLUMN diagnoses.clarification_question_count IS
  'Number of clarification_questions chips returned by the AI. 0 when not applicable. Used to monitor prompt quality.';
