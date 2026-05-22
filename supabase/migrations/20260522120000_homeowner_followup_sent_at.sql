-- Add followup tracking columns to diagnoses.
--
-- followup_sent_at: timestamp set by the homeowner-followup cron once the
--   post-diagnosis follow-up email has been dispatched. NULL = not yet sent.
--
-- homeowner_email: denormalised email address for homeowners who completed a
--   diagnosis. Populated at diagnosis time so the cron can send without a
--   round-trip to Supabase Auth. May be NULL for anonymous (guest) sessions.

ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS homeowner_email text;

-- Partial index: only index rows that still need a follow-up email sent.
-- The cron queries by created_at window + followup_sent_at IS NULL, so this
-- index keeps the query fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_diagnoses_followup
    ON diagnoses (created_at, followup_sent_at)
    WHERE followup_sent_at IS NULL;
