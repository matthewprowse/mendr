/**
 * File: tables.sql
 * Description: Supabase schema definitions for provider caching and conversation tracking.
 * This file is idempotent and can be run multiple times to create OR update your database.
 */

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
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('up', 'down'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments TEXT[];
ALTER TABLE messages ADD COLUMN IF NOT EXISTS has_updated_diagnosis BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS diagnosis_json JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS providers_json JSONB;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

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
