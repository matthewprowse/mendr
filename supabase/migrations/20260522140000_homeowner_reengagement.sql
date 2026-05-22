-- Migration: homeowner re-engagement tracking table
--
-- Tracks homeowner email addresses, their diagnosis activity, and whether a
-- re-engagement email has been sent. Populated by the diagnose API (see
-- /api/diagnose/route.ts — TODO: upsert homeowner_emails on each diagnosis).
--
-- This table is read by the /api/cron/homeowner-reengagement cron job.

CREATE TABLE IF NOT EXISTS homeowner_emails (
  email                text        PRIMARY KEY,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_diagnosis_at    timestamptz NOT NULL DEFAULT now(),
  reengagement_sent_at timestamptz,
  diagnosis_count      integer     NOT NULL DEFAULT 1
);

-- Partial index on candidates eligible for re-engagement:
-- rows where last_diagnosis_at is old and no email has been sent yet.
CREATE INDEX IF NOT EXISTS idx_homeowner_emails_reengagement
  ON homeowner_emails(last_diagnosis_at, reengagement_sent_at)
  WHERE reengagement_sent_at IS NULL;
