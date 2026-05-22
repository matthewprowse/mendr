-- Add approved_at and onboarding email tracking columns to provider_applications.
-- approved_at records when the application was moved to status = 'approved',
-- enabling day-3 and day-7 onboarding cron jobs to target the right rows.

ALTER TABLE provider_applications
    ADD COLUMN IF NOT EXISTS approved_at            timestamptz,
    ADD COLUMN IF NOT EXISTS onboarding_d3_sent_at  timestamptz,
    ADD COLUMN IF NOT EXISTS onboarding_d7_sent_at  timestamptz;

-- Partial index for the day-3 cron: rows approved ~3 days ago with no d3 email sent yet.
CREATE INDEX IF NOT EXISTS idx_provider_applications_onboarding_d3
    ON provider_applications (approved_at ASC)
    WHERE status = 'approved' AND onboarding_d3_sent_at IS NULL;

-- Partial index for the day-7 cron: rows approved ~7 days ago with no d7 email sent yet.
CREATE INDEX IF NOT EXISTS idx_provider_applications_onboarding_d7
    ON provider_applications (approved_at ASC)
    WHERE status = 'approved' AND onboarding_d7_sent_at IS NULL;
