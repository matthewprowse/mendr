-- =============================================================================
-- Scandio — Table definitions
-- Run these in order. Safe to re-run; all statements use IF NOT EXISTS / IF EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- services
-- Canonical list of trade categories surfaced in the welcome / diagnosis UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text NOT NULL UNIQUE,          -- e.g. "Plumbing", "Electrical"
    search_query text,                          -- Google Places query override
    active      boolean NOT NULL DEFAULT true,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- conversations
-- One row per homeowner scan session. Holds the uploaded image, AI diagnosis,
-- and the customer's resolved location.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id                          uuid PRIMARY KEY,
    title                       text,
    image_url                   text,
    diagnosis                   jsonb,          -- DiagnosisData (includes trade, trade_detail, etc.)
    initial_image_description   text,
    customer_lat                double precision,
    customer_lng                double precision,
    customer_address            text,
    device                      text,
    user_agent                  text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- providers
-- One row per service provider (sourced from Google Places or direct sign-up).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS providers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source              text NOT NULL DEFAULT 'google', -- 'google' | 'direct'
    google_place_id     text UNIQUE,
    name                text NOT NULL,
    address             text,
    rating              numeric(3,1),
    rating_count        integer NOT NULL DEFAULT 0,
    phone               text,
    website             text,
    latitude            double precision,
    longitude           double precision,
    summary             text NOT NULL DEFAULT '',
    -- Long-form profile copy (About + past work style); match/cards use `summary`
    summary_long        text,
    services            jsonb NOT NULL DEFAULT '[]',
    service_categories  text[],
    weekday_descriptions text[],
    -- Enrichment fields populated by the background website scrape + AI extraction
    about               text,       -- "About" section extracted from provider website
    past_work           text,       -- Past projects / portfolio section
    -- Operational timestamps
    last_updated        timestamptz,
    last_matched_at     timestamptz,  -- Set each time provider appears in a match result
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Add last_matched_at if upgrading an existing database
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_matched_at timestamptz;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS about text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS past_work text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS summary_long text;

-- ---------------------------------------------------------------------------
-- reviews
-- Google and Scandio reviews for providers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    source          text NOT NULL,          -- 'google' | 'scandio'
    source_ref      text,                   -- Google review name / Scandio review id
    reviewer_name   text,
    rating          numeric(3,1),
    body            text,
    relative_publish_time_description text,
    raw             jsonb,
    category_ratings jsonb,                 -- { quality, value, communication, … }
    status          text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_ref)
);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_name text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS relative_publish_time_description text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS raw jsonb;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- provider_images
-- Images for providers pulled from Google Places photos or website scraping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_images (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    source      text NOT NULL,              -- 'google' | 'website'
    source_ref  text,                       -- Google photo resource name or URL
    caption     text,
    bucket      text NOT NULL,
    path        text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    status      text NOT NULL DEFAULT 'approved',
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_images ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE provider_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE provider_images ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS provider_images_provider_source_ref_key
    ON provider_images (provider_id, source, source_ref);
CREATE INDEX IF NOT EXISTS idx_provider_images_provider_sort
    ON provider_images (provider_id, sort_order ASC, created_at DESC);

-- ---------------------------------------------------------------------------
-- provider_search_cache
-- Short-lived cache (7 days) mapping a (lat, lng, trade, radius) tuple to the
-- list of place IDs returned by Google Places. Avoids redundant API calls when
-- multiple users in the same area search for the same trade.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_search_cache (
    query_key           text PRIMARY KEY,
    place_ids           text[] NOT NULL DEFAULT '{}',
    routing_summaries   jsonb,
    next_page_token     text,
    providers           jsonb,              -- Cached provider objects (fast-path)
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- provider_cache
-- Background enrichment cache used by match card metadata.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_cache (
    provider_id            uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
    google_place_id        text NOT NULL DEFAULT '',
    scraped_at             timestamptz,
    enriched_at            timestamptz,
    scrape_status          text NOT NULL DEFAULT 'pending',
    bio                    text,
    specialisations        text[] NOT NULL DEFAULT '{}',
    years_experience       integer,
    service_areas          text[] NOT NULL DEFAULT '{}',
    certifications         text[] NOT NULL DEFAULT '{}',
    response_profile       text,
    website_quality        text,
    profile_completeness   smallint NOT NULL DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 3),
    images                 jsonb,
    has_work_photos        boolean NOT NULL DEFAULT false,
    review_summary         text,
    raw_scrape_text        text,
    cache_version          integer NOT NULL DEFAULT 1,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- provider_rotation_tokens
-- Token-bucket mechanism for equitable provider distribution.
--
-- Every provider starts each ISO week (week_key = 'YYYY-Www') with 5 tokens.
-- Each time the provider is included in a match result, 1 token is deducted.
-- Providers at 0 tokens are demoted to the end of the carousel (not excluded)
-- so under-represented providers get exposure. Tokens reset automatically
-- at the start of each new week (a new row is created; old rows are ignored).
--
-- The rotation is self-correcting: providers who are shown often but never
-- contacted (ghost leads) stay at 0 tokens and yield their slot. Providers
-- who respond well continue to accumulate visibility.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_rotation_tokens (
    provider_id         uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    week_key            text NOT NULL,          -- ISO week: '2026-W12'
    tokens_remaining    smallint NOT NULL DEFAULT 5 CHECK (tokens_remaining >= 0),
    last_shown_at       timestamptz,
    PRIMARY KEY (provider_id, week_key)
);

CREATE INDEX IF NOT EXISTS idx_rotation_tokens_week
    ON provider_rotation_tokens (week_key);

-- ---------------------------------------------------------------------------
-- provider_contact_events
-- Contact intent events used for token restore dedupe.
-- One event key per (provider, conversation, channel, ISO week) can be restored
-- once within the short dedupe window at the API layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_contact_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    channel         text NOT NULL CHECK (channel IN ('phone', 'email', 'whatsapp')),
    dedupe_key      text NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_contact_events_created_at
    ON provider_contact_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- directions_cache
-- 7-day cache for Google Maps Directions API responses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS directions_cache (
    cache_key   text PRIMARY KEY,
    response    jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ai_logs
-- Lightweight event log for AI endpoint calls (for monitoring / cost tracking).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint    text,
    status      text,
    duration_ms integer,
    meta        jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- profiles
-- One row per authenticated user. Created automatically on first sign-in
-- via the /auth/callback route. First name, surname, and address are
-- collected at sign-up and stored in auth.users user_metadata, then
-- copied here on callback.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name  text NOT NULL DEFAULT '',
    surname     text NOT NULL DEFAULT '',
    address     text,
    address_lat double precision,
    address_lng double precision,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Link conversations to authenticated users (nullable — anonymous scans allowed).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id);

-- ---------------------------------------------------------------------------
-- diagnosis_usage
-- Per-day quota tracking for the /api/diagnose endpoint.
-- Authenticated users: keyed by user_id, limit 10/day.
-- Anonymous users:     keyed by anonymous_key (UUID cookie), limit 3/day.
-- One deduction per conversation (on the first message only; follow-ups free).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnosis_usage (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    anonymous_key   text,
    date            date NOT NULL DEFAULT current_date,
    count           integer NOT NULL DEFAULT 0,
    CONSTRAINT diagnosis_usage_user_date_key    UNIQUE (user_id, date),
    CONSTRAINT diagnosis_usage_anon_date_key    UNIQUE (anonymous_key, date),
    CONSTRAINT diagnosis_usage_has_key          CHECK (user_id IS NOT NULL OR anonymous_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_usage_date ON diagnosis_usage (date);

-- ---------------------------------------------------------------------------
-- provider_applications
-- Direct sign-up submissions from the /pro/onboard flow.
-- Separate from the providers table (which is built for Google Places data)
-- so that pending applications can be reviewed before going live.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_applications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name       text NOT NULL,
    contact_name        text NOT NULL,
    address             text NOT NULL,
    phone               text NOT NULL,
    website             text,
    trade               text NOT NULL,
    trade_description   text NOT NULL,
    service_areas       jsonb NOT NULL DEFAULT '[]',  -- [{address, lat, lng, radius_km}]
    years_experience    integer,
    team_size           integer,
    registration_number text,
    about               text,
    referral            text,
    status              text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
