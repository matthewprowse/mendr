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
