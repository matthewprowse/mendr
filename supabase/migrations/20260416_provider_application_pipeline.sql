-- ─────────────────────────────────────────────────────────────────────────────
-- Two-stage contractor onboarding pipeline
-- Migration: 20260416_provider_application_pipeline
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_trgm for fuzzy name matching against providers table
create extension if not exists pg_trgm;

-- ── Columns on provider_applications ─────────────────────────────────────────

-- Stage 1: confirmation email
alter table provider_applications
    add column if not exists confirmation_email_status  text    not null default 'pending'
        check (confirmation_email_status in ('pending', 'sent', 'failed')),
    add column if not exists confirmation_email_sent_at timestamptz,
    add column if not exists confirmation_email_error   text;

-- Stage 2: enrichment + matching
alter table provider_applications
    add column if not exists enrichment_status          text    not null default 'pending'
        check (enrichment_status in ('pending', 'queued', 'running', 'matched', 'no_match', 'failed', 'complete')),
    add column if not exists enrichment_queued_at       timestamptz,
    add column if not exists enrichment_started_at      timestamptz,
    add column if not exists enrichment_completed_at    timestamptz,
    add column if not exists enrichment_error           text,
    add column if not exists matched_provider_id        uuid        references providers(id) on delete set null,
    add column if not exists matched_google_place_id    text,
    add column if not exists match_score                numeric(5, 4),
    add column if not exists enrichment_input           jsonb,
    add column if not exists enrichment_payload         jsonb;

-- Gemini summary
alter table provider_applications
    add column if not exists gemini_summary             text,
    add column if not exists gemini_model               text,
    add column if not exists gemini_generated_at        timestamptz;

-- Applicant edits (from secure edit link)
alter table provider_applications
    add column if not exists applicant_summary          text,
    add column if not exists applicant_edited_at        timestamptz,
    add column if not exists applicant_profile_edits    jsonb;

-- Stage 3: invitation email (admin-triggered)
alter table provider_applications
    add column if not exists invitation_email_status    text
        check (invitation_email_status in ('pending', 'sent', 'failed')),
    add column if not exists invitation_email_sent_at   timestamptz,
    add column if not exists invitation_email_error     text;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Partial index on enrichment queue — only unprocessed rows
create index if not exists idx_provider_applications_enrichment_queued
    on provider_applications (enrichment_queued_at asc)
    where enrichment_status = 'queued';

-- pg_trgm GIN index on providers.name for fast fuzzy matching
create index if not exists idx_providers_name_trgm
    on providers using gin (name gin_trgm_ops);

-- ── Secure edit tokens ────────────────────────────────────────────────────────

create table if not exists provider_application_edit_tokens (
    id                      uuid primary key default gen_random_uuid(),
    provider_application_id uuid not null references provider_applications(id) on delete cascade,
    token_hash              text not null unique,       -- sha256(raw_token), hex
    expires_at              timestamptz not null,
    used_at                 timestamptz,
    revoked_at              timestamptz,
    created_at              timestamptz not null default now()
);

create index if not exists idx_edit_tokens_application_id
    on provider_application_edit_tokens (provider_application_id);

create index if not exists idx_edit_tokens_token_hash
    on provider_application_edit_tokens (token_hash);

-- ── Row-level security ────────────────────────────────────────────────────────
-- Edit tokens table is service-role only (no public access).
alter table provider_application_edit_tokens enable row level security;

-- No public policies — all access goes through admin/service-role client.
