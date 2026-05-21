-- Add is_direct_match flag to diagnoses.
-- Direct-match rows are created when a homeowner skips the AI diagnosis pipeline
-- and goes straight to the contractor match page. The diagnosis JSONB on these rows
-- contains only the trade + user description — no thought, message, or action_required.
ALTER TABLE public.diagnoses
    ADD COLUMN IF NOT EXISTS is_direct_match boolean NOT NULL DEFAULT false;

-- Partial index for admin/analytics queries on direct-match rows.
CREATE INDEX IF NOT EXISTS idx_diagnoses_is_direct_match
    ON public.diagnoses (created_at DESC)
    WHERE is_direct_match = true;
