-- Backend Security & Launch Readiness: M14 (foreign-key indexes) + L8 (drop
-- duplicate indexes). These help the Pro portal as jobs/quotes/invoices grow.
-- Plain CREATE INDEX (not CONCURRENTLY) because migrations run in a transaction;
-- the tables are small pre-launch so the brief lock is harmless.

-- ── M14: covering indexes for unindexed foreign keys ────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_model_pricing_created_by               ON public.ai_model_pricing (created_by);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id                   ON public.credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id                      ON public.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id                           ON public.invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id                         ON public.invoices (quote_id);
CREATE INDEX IF NOT EXISTS idx_job_outcome_tokens_provider_id            ON public.job_outcome_tokens (provider_id);
CREATE INDEX IF NOT EXISTS idx_job_outcomes_token_id                     ON public.job_outcomes (token_id);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to                          ON public.jobs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id                          ON public.jobs (customer_id);
CREATE INDEX IF NOT EXISTS idx_lead_contact_consents_diagnosis_id        ON public.lead_contact_consents (diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_lead_states_assigned_to                   ON public.lead_states (assigned_to);
CREATE INDEX IF NOT EXISTS idx_provider_applications_matched_provider_id ON public.provider_applications (matched_provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_applications_resubmission_of     ON public.provider_applications (resubmission_of);
CREATE INDEX IF NOT EXISTS idx_provider_claims_reviewed_by               ON public.provider_claims (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_provider_contact_events_conversation_id   ON public.provider_contact_events (conversation_id);
CREATE INDEX IF NOT EXISTS idx_provider_contact_events_provider_id       ON public.provider_contact_events (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_customers_homeowner_user_id      ON public.provider_customers (homeowner_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_members_invited_by               ON public.provider_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_provider_notification_preferences_user_id ON public.provider_notification_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_providers_merged_into                     ON public.providers (merged_into);
CREATE INDEX IF NOT EXISTS idx_quotes_contact_event_id                   ON public.quotes (contact_event_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id                        ON public.quotes (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_user_id                  ON public.reviews (reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active_diagnosis_id     ON public.whatsapp_sessions (active_diagnosis_id);

-- ── L8: drop duplicate indexes (keep one of each identical pair). The
-- provider_images unique CONSTRAINT is kept; only the redundant plain index is
-- dropped. ───────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.provider_contact_events_created_at_idx;
DROP INDEX IF EXISTS public.provider_images_provider_sort_idx;
DROP INDEX IF EXISTS public.provider_images_provider_source_ref_key;
DROP INDEX IF EXISTS public.reviews_provider_id_idx;
