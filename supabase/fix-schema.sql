-- =============================================================================
-- Fix Schema: Run this in Supabase SQL Editor if you see:
--   - "relation jobs does not exist" when accessing conversations
--   - "Could not find the 'diagnosis_updated' column of 'messages'"
--
-- Prerequisites: profiles table must exist (from tables.sql or auth setup).
-- If you get errors about missing profiles, run the full tables.sql first.
--
-- After running: Reload the Supabase schema (Dashboard → Settings → API → Reload)
-- =============================================================================

-- 1. Ensure job_status enum exists (required by jobs table)
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('lead', 'quoted', 'active', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create provider_locations if missing (jobs depends on it)
CREATE TABLE IF NOT EXISTS provider_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nickname TEXT,
    address TEXT NOT NULL DEFAULT '',
    latitude DECIMAL,
    longitude DECIMAL,
    service_radius_km INTEGER DEFAULT 25,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_locations_provider ON provider_locations(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_locations_active ON provider_locations(is_active) WHERE is_active = true;

-- 3. Create provider_profiles if missing (for completeness)
CREATE TABLE IF NOT EXISTS provider_profiles (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    banner_url TEXT,
    short_description VARCHAR(160),
    main_description TEXT,
    service_categories TEXT[] DEFAULT '{}',
    google_place_id TEXT,
    ai_review_summary TEXT,
    positives TEXT[] DEFAULT '{}',
    negatives TEXT[] DEFAULT '{}',
    metrics_punctuality DECIMAL DEFAULT 0,
    metrics_tidiness DECIMAL DEFAULT 0,
    metrics_professionalism DECIMAL DEFAULT 0,
    metrics_cleanup DECIMAL DEFAULT 0,
    total_jobs_completed INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_slug ON provider_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_google_place ON provider_profiles(google_place_id) WHERE google_place_id IS NOT NULL;

-- Ensure cached_providers has AI review summary for Pro page summaries
ALTER TABLE cached_providers ADD COLUMN IF NOT EXISTS ai_review_summary TEXT;

-- 4. Create jobs table if missing (fixes "relation jobs does not exist")
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL,
    status job_status DEFAULT 'lead',
    category TEXT NOT NULL DEFAULT '',
    initial_diagnosis_id UUID,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    current_quote JSONB DEFAULT '{"parts": [], "labour": [], "total": 0}'::jsonb,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_provider ON jobs(provider_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

-- 5. Ensure conversation_id column exists on existing jobs table (fixes "column j.conversation_id does not exist")
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- 6. Add diagnosis_updated to messages if missing (fixes PGRST204)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS diagnosis_updated BOOLEAN DEFAULT false;

-- 7. Migrate old column name if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'has_updated_diagnosis') THEN
        ALTER TABLE messages RENAME COLUMN has_updated_diagnosis TO diagnosis_updated;
    END IF;
END $$;

-- 8. RLS for jobs (only if jobs exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'jobs') THEN
        ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Jobs select own" ON jobs;
        DROP POLICY IF EXISTS "Jobs update own" ON jobs;
        DROP POLICY IF EXISTS "Jobs insert" ON jobs;
        CREATE POLICY "Jobs select own" ON jobs FOR SELECT USING (client_id = auth.uid() OR provider_id = auth.uid());
        CREATE POLICY "Jobs update own" ON jobs FOR UPDATE USING (client_id = auth.uid() OR provider_id = auth.uid()) WITH CHECK (true);
        CREATE POLICY "Jobs insert" ON jobs FOR INSERT WITH CHECK (client_id = auth.uid() OR provider_id = auth.uid());
    END IF;
END $$;
