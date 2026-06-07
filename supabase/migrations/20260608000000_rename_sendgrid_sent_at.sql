-- Rename sendgrid_sent_at → email_sent_at on provider_applications
-- The column tracks when an outreach email was sent; the route uses Resend (not SendGrid).
-- Renaming removes the misleading vendor coupling from the schema.
ALTER TABLE provider_applications
  RENAME COLUMN sendgrid_sent_at TO email_sent_at;
