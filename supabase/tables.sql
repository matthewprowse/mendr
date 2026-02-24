/**
 * File: tables.sql
 * Description: Supabase schema definitions for provider caching and conversation tracking.
 * This file is idempotent and can be run multiple times to create OR update your database.
 */

-- Migration: Reports are now public; drop obsolete PIN/token tables
DROP TABLE IF EXISTS report_owner_tokens;
DROP TABLE IF EXISTS report_access;

-- 1. Providers Cache
CREATE TABLE IF NOT EXISTS cached_providers (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    rating DECIMAL(3,2),
    rating_count INTEGER,
    phone TEXT,
    website TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    summary TEXT,
    services JSONB,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- IDEMPOTENT UPDATES: Ensure columns exist and have correct types
ALTER TABLE cached_providers ALTER COLUMN services TYPE JSONB USING to_jsonb(services);

-- 2. Conversations
-- diagnosis_json: cached snapshot of latest diagnosis (denormalized for quick access). Source of truth: diagnoses table.
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT DEFAULT 'New Diagnosis',
    image_url TEXT,
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    user_address TEXT,
    diagnosis_json JSONB,
    diagnosis_confirmed BOOLEAN DEFAULT FALSE,
    providers_json JSONB,
    device_type TEXT,
    user_agent TEXT,
    ip_hash TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IDEMPOTENT UPDATES: Ensure all columns exist in case the table already existed
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'New Diagnosis';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_lat DOUBLE PRECISION;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_lng DOUBLE PRECISION;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_address TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS diagnosis_json JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS diagnosis_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS providers_json JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ip_hash TEXT;

-- 3. Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    attachments TEXT[],
    feedback TEXT CHECK (feedback IN ('up', 'down')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IDEMPOTENT UPDATES: Ensure all columns exist for messages
-- diagnosis_json, providers_json: cached per message (denormalized). Source of truth for diagnosis: diagnoses table.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('up', 'down'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments TEXT[];
ALTER TABLE messages ADD COLUMN IF NOT EXISTS has_updated_diagnosis BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS diagnosis_json JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS providers_json JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS emerging_providers_json JSONB;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- 3b. Diagnoses (source of truth; one per diagnosis event; conversation 1→many diagnoses)
-- Single owning FK: diagnosis belongs to message via message_id (no redundant messages.diagnosis_id).
CREATE TABLE IF NOT EXISTS diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    diagnosis_json JSONB NOT NULL,
    trade TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_conversation ON diagnoses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_message ON diagnoses(message_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_created ON diagnoses(created_at);

-- 3c. Scandio Reports = shareable diagnosis report document
-- Links to one diagnosis. Conversation can have multiple reports. Denormalized conversation_id for query performance.
CREATE TABLE IF NOT EXISTS scandio_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
    title TEXT,
    share_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scandio_reports_conversation ON scandio_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scandio_reports_diagnosis ON scandio_reports(diagnosis_id);

ALTER TABLE scandio_reports ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE scandio_reports ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scandio_reports_share_token ON scandio_reports(share_token) WHERE share_token IS NOT NULL;

-- 4. Leads (track contact clicks)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    provider_place_id TEXT,
    provider_name TEXT,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('whatsapp', 'phone', 'email')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_conversation ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Add locked flag to conversations (when report/WhatsApp summary is sent)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 5. Provider Signups (Scandio coming soon - service providers join network)
CREATE TABLE IF NOT EXISTS provider_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    email TEXT NOT NULL,
    descriptive_text TEXT,
    team_size TEXT,
    spend_per_month TEXT,
    price_per_lead TEXT,
    report_conversation_id UUID,
    marketing_consent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS team_size TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS spend_per_month TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS price_per_lead TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_provider_signups_created ON provider_signups(created_at);

-- 6. Provider Reports (users report providers to Scandio — scam, fake listing, etc.)
CREATE TABLE IF NOT EXISTS provider_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_place_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    provider_address TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    reporter_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_reports_created ON provider_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_reports_place_id ON provider_reports(provider_place_id);
