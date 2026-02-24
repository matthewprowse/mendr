/**
 * File: 02_rls.sql
 * Description: Basic Row Level Security (RLS) policies for anonymous access.
 * This file is idempotent and can be run multiple times.
 */

-- Enable RLS on all tables
ALTER TABLE cached_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 1. Cached Providers: Public read access for everyone
DROP POLICY IF EXISTS "Public Read Cached Providers" ON cached_providers;
CREATE POLICY "Public Read Cached Providers" 
ON cached_providers FOR SELECT 
USING (true);

-- 2. Conversations: Allow anonymous create, read, update (by id)
DROP POLICY IF EXISTS "Public All Access Conversations" ON conversations;
DROP POLICY IF EXISTS "Conversations allow select" ON conversations;
DROP POLICY IF EXISTS "Conversations allow insert" ON conversations;
DROP POLICY IF EXISTS "Conversations allow update" ON conversations;
CREATE POLICY "Conversations allow select" ON conversations FOR SELECT USING (true);
CREATE POLICY "Conversations allow insert" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Conversations allow update" ON conversations FOR UPDATE USING (true) WITH CHECK (true);

-- 3. Messages: Allow anonymous read/insert/update for any conversation
DROP POLICY IF EXISTS "Public All Access Messages" ON messages;
DROP POLICY IF EXISTS "Messages allow select" ON messages;
DROP POLICY IF EXISTS "Messages allow insert" ON messages;
DROP POLICY IF EXISTS "Messages allow update" ON messages;
CREATE POLICY "Messages allow select" ON messages FOR SELECT USING (true);
CREATE POLICY "Messages allow insert" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Messages allow update" ON messages FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Leads: Allow anonymous insert and select
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leads allow insert" ON leads;
DROP POLICY IF EXISTS "Leads allow select" ON leads;
CREATE POLICY "Leads allow insert" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Leads allow select" ON leads FOR SELECT USING (true);

-- 5. Provider Signups: Allow anonymous insert
ALTER TABLE provider_signups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider signups allow insert" ON provider_signups;
CREATE POLICY "Provider signups allow insert" ON provider_signups FOR INSERT WITH CHECK (true);

-- 6. Provider Incident Reports: Users report bad providers (scam, fake listing, etc.)
ALTER TABLE provider_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider reports allow insert" ON provider_reports;
CREATE POLICY "Provider reports allow insert" ON provider_reports FOR INSERT WITH CHECK (true);

-- 7. Diagnoses: Source of truth. Conversation 1→many diagnoses.
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Diagnoses allow select" ON diagnoses;
DROP POLICY IF EXISTS "Diagnoses allow insert" ON diagnoses;
CREATE POLICY "Diagnoses allow select" ON diagnoses FOR SELECT USING (true);
CREATE POLICY "Diagnoses allow insert" ON diagnoses FOR INSERT WITH CHECK (true);

-- 8. Scandio Reports: Shareable diagnosis report. One per diagnosis. Anonymous select/insert/update (for share_token).
ALTER TABLE scandio_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scandio_reports allow select" ON scandio_reports;
DROP POLICY IF EXISTS "Scandio_reports allow insert" ON scandio_reports;
DROP POLICY IF EXISTS "Scandio_reports allow update" ON scandio_reports;
CREATE POLICY "Scandio_reports allow select" ON scandio_reports FOR SELECT USING (true);
CREATE POLICY "Scandio_reports allow insert" ON scandio_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Scandio_reports allow update" ON scandio_reports FOR UPDATE USING (true) WITH CHECK (true);
