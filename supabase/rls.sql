/**
 * File: rls.sql
 * Description: Row Level Security (RLS) policies for all public and storage tables.
 * Idempotent: safe to run multiple times. Run after tables.sql.
 */

-- Enable RLS on all tables
ALTER TABLE cached_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 1. Services: Public read access (canonical service list)
DROP POLICY IF EXISTS "Public Read Services" ON services;
CREATE POLICY "Public Read Services" ON services FOR SELECT USING (active = true);

-- 2. Cached Providers: Public read access for everyone
DROP POLICY IF EXISTS "Public Read Cached Providers" ON cached_providers;
CREATE POLICY "Public Read Cached Providers" 
ON cached_providers FOR SELECT 
USING (true);

-- 2b. API caches: public read (writes use service role / admin)
ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Geocode Cache" ON geocode_cache;
CREATE POLICY "Public Read Geocode Cache" ON geocode_cache FOR SELECT USING (true);

ALTER TABLE directions_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Directions Cache" ON directions_cache;
CREATE POLICY "Public Read Directions Cache" ON directions_cache FOR SELECT USING (true);

ALTER TABLE place_photo_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Place Photo Cache" ON place_photo_cache;
CREATE POLICY "Public Read Place Photo Cache" ON place_photo_cache FOR SELECT USING (true);

-- =============================================================================
-- Phase 6: Secure messaging — conversations and messages
-- Customers: only their conversations (user_id = auth.uid()).
-- Pros: conversations linked to a job where job.provider_id = auth.uid().
-- Anonymous: can still create/read/update for unclaimed (user_id IS NULL) so diagnosis flow works.
-- =============================================================================

-- Helper: true if conversation c_id is visible to current user (customer, pro with job, or anon for unclaimed)
CREATE OR REPLACE FUNCTION public.conversation_visible_to_user(c_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = c_id
    AND (
      c.user_id = auth.uid()
      OR (auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.conversation_id = c.id AND j.provider_id = auth.uid()
      ))
      OR (c.user_id IS NULL AND auth.uid() IS NULL)
    )
  );
$$;

-- 3. Conversations: Customer owns (user_id), Pro sees if job linked, anon sees unclaimed only
DROP POLICY IF EXISTS "Public All Access Conversations" ON conversations;
DROP POLICY IF EXISTS "Conversations allow select" ON conversations;
DROP POLICY IF EXISTS "Conversations allow insert" ON conversations;
DROP POLICY IF EXISTS "Conversations allow update" ON conversations;
CREATE POLICY "Conversations select own or pro job" ON conversations
  FOR SELECT USING (conversation_visible_to_user(id));
CREATE POLICY "Conversations insert own or unclaimed" ON conversations
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Conversations update visible" ON conversations
  FOR UPDATE USING (conversation_visible_to_user(id)) WITH CHECK (conversation_visible_to_user(id));

-- 4. Messages: Same visibility as parent conversation (diagnosis chat)
DROP POLICY IF EXISTS "Public All Access Messages" ON messages;
DROP POLICY IF EXISTS "Messages allow select" ON messages;
DROP POLICY IF EXISTS "Messages allow insert" ON messages;
DROP POLICY IF EXISTS "Messages allow update" ON messages;
CREATE POLICY "Messages select visible conv" ON messages
  FOR SELECT USING (conversation_visible_to_user(conversation_id));
CREATE POLICY "Messages insert visible conv" ON messages
  FOR INSERT WITH CHECK (conversation_visible_to_user(conversation_id));
CREATE POLICY "Messages update visible conv" ON messages
  FOR UPDATE USING (conversation_visible_to_user(conversation_id));

-- 5. Leads: Allow anonymous insert and select
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leads allow insert" ON leads;
DROP POLICY IF EXISTS "Leads allow select" ON leads;
CREATE POLICY "Leads allow insert" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Leads allow select" ON leads FOR SELECT USING (true);

-- 6. Provider Signups: Allow anonymous insert
ALTER TABLE provider_signups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider signups allow insert" ON provider_signups;
CREATE POLICY "Provider signups allow insert" ON provider_signups FOR INSERT WITH CHECK (true);

-- 7. Provider Incident Reports: Users report bad providers (scam, fake listing, etc.)
ALTER TABLE provider_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider reports allow insert" ON provider_reports;
CREATE POLICY "Provider reports allow insert" ON provider_reports FOR INSERT WITH CHECK (true);

-- 8. Diagnoses: Source of truth. Conversation 1→many diagnoses.
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Diagnoses allow select" ON diagnoses;
DROP POLICY IF EXISTS "Diagnoses allow insert" ON diagnoses;
CREATE POLICY "Diagnoses allow select" ON diagnoses FOR SELECT USING (true);
CREATE POLICY "Diagnoses allow insert" ON diagnoses FOR INSERT WITH CHECK (true);

-- 9. Scandio Reports: Shareable diagnosis report. One per diagnosis. Anonymous select/insert/update (for share_token).
ALTER TABLE scandio_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scandio_reports allow select" ON scandio_reports;
DROP POLICY IF EXISTS "Scandio_reports allow insert" ON scandio_reports;
DROP POLICY IF EXISTS "Scandio_reports allow update" ON scandio_reports;
CREATE POLICY "Scandio_reports allow select" ON scandio_reports FOR SELECT USING (true);
CREATE POLICY "Scandio_reports allow insert" ON scandio_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Scandio_reports allow update" ON scandio_reports FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE feedback_unrelated ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Feedback unrelated allow insert" ON feedback_unrelated;
CREATE POLICY "Feedback unrelated allow insert" ON feedback_unrelated FOR INSERT WITH CHECK (true);

ALTER TABLE feedback_unserviced ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Feedback unserviced allow insert" ON feedback_unserviced;
CREATE POLICY "Feedback unserviced allow insert" ON feedback_unserviced FOR INSERT WITH CHECK (true);

-- 12. Legal Documents: Public read access for active documents only
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Legal documents public read active" ON legal_documents;
CREATE POLICY "Legal documents public read active" ON legal_documents
    FOR SELECT USING (is_active = true);

-- 13. Provider profiles (Phase 1/4): Public read for Unified Provider Page
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider profiles public read" ON provider_profiles;
CREATE POLICY "Provider profiles public read" ON provider_profiles FOR SELECT USING (true);

-- 14. Audit logs: Server/admin only (no anon read; inserts via service role)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Audit logs no anon read" ON audit_logs;
CREATE POLICY "Audit logs no anon read" ON audit_logs FOR SELECT USING (false);

-- =============================================================================
-- Phase 1 (New Standard): profiles, provider_locations, provider_profiles, jobs, audit_logs
-- =============================================================================

-- Profiles: users can read/update own (id or user_id = auth.uid())
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Profiles select own" ON profiles;
        DROP POLICY IF EXISTS "Profiles update own" ON profiles;
        CREATE POLICY "Profiles select own" ON profiles FOR SELECT USING (id = auth.uid() OR user_id = auth.uid());
        CREATE POLICY "Profiles update own" ON profiles FOR UPDATE USING (id = auth.uid() OR user_id = auth.uid()) WITH CHECK (id = auth.uid() OR user_id = auth.uid());
        DROP POLICY IF EXISTS "Profiles insert own" ON profiles;
        CREATE POLICY "Profiles insert own" ON profiles FOR INSERT WITH CHECK (id = auth.uid() OR user_id = auth.uid());
    END IF;
END $$;

-- Provider locations: public read active (for discovery); provider CRUD own
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'provider_locations') THEN
        ALTER TABLE provider_locations ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Provider locations public read active" ON provider_locations;
        DROP POLICY IF EXISTS "Provider locations provider full access" ON provider_locations;
        CREATE POLICY "Provider locations public read active" ON provider_locations FOR SELECT USING (is_active = true);
        CREATE POLICY "Provider locations provider full access" ON provider_locations FOR ALL USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid());
    END IF;
END $$;

-- Provider profiles: public read (for /pro/[slug]); provider full access to own
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'provider_profiles') THEN
        ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Provider profiles public read" ON provider_profiles;
        DROP POLICY IF EXISTS "Provider profiles provider full access" ON provider_profiles;
        CREATE POLICY "Provider profiles public read" ON provider_profiles FOR SELECT USING (true);
        CREATE POLICY "Provider profiles provider full access" ON provider_profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
    END IF;
END $$;

-- Jobs: client and provider can read/update their own; insert by client or service
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

-- Phase 6: job_conversations — only client and assigned Pro can read/write
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_conversations') THEN
        ALTER TABLE job_conversations ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Job conversations select participant" ON job_conversations;
        DROP POLICY IF EXISTS "Job conversations insert participant" ON job_conversations;
        CREATE POLICY "Job conversations select participant" ON job_conversations FOR SELECT
            USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_conversations.job_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())));
        CREATE POLICY "Job conversations insert participant" ON job_conversations FOR INSERT
            WITH CHECK (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_conversations.job_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())));
    END IF;
END $$;

-- Phase 6: job_messages — only participants (client or Pro) for that job's thread
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_messages') THEN
        ALTER TABLE job_messages ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Job messages select participant" ON job_messages;
        DROP POLICY IF EXISTS "Job messages insert participant" ON job_messages;
        -- Schema A: job_messages.conversation_id -> job_conversations -> jobs
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_messages' AND column_name = 'conversation_id') THEN
            CREATE POLICY "Job messages select participant" ON job_messages FOR SELECT
                USING (EXISTS (
                    SELECT 1 FROM job_conversations jc
                    JOIN jobs j ON j.id = jc.job_id
                    WHERE jc.id = job_messages.conversation_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())
                ));
            CREATE POLICY "Job messages insert participant" ON job_messages FOR INSERT
                WITH CHECK (EXISTS (
                    SELECT 1 FROM job_conversations jc
                    JOIN jobs j ON j.id = jc.job_id
                    WHERE jc.id = job_messages.conversation_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())
                ));
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_messages' AND column_name = 'job_id') THEN
            CREATE POLICY "Job messages select participant" ON job_messages FOR SELECT
                USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_messages.job_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())));
            CREATE POLICY "Job messages insert participant" ON job_messages FOR INSERT
                WITH CHECK (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_messages.job_id AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())));
        END IF;
    END IF;
END $$;

-- Phase 6: audit_logs — insert-only (no UPDATE/DELETE from app); read by owner or service role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
        ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Audit logs allow insert" ON audit_logs;
        DROP POLICY IF EXISTS "Audit logs allow select own or service" ON audit_logs;
        DROP POLICY IF EXISTS "Audit logs deny update" ON audit_logs;
        DROP POLICY IF EXISTS "Audit logs deny delete" ON audit_logs;
        CREATE POLICY "Audit logs allow insert" ON audit_logs FOR INSERT WITH CHECK (true);
        CREATE POLICY "Audit logs allow select own or service" ON audit_logs
            FOR SELECT USING (auth.role() = 'service_role' OR user_id = auth.uid());
        -- No UPDATE/DELETE policies: only service_role can modify (non-repudiation)
        CREATE POLICY "Audit logs deny update" ON audit_logs FOR UPDATE USING (false);
        CREATE POLICY "Audit logs deny delete" ON audit_logs FOR DELETE USING (false);
    END IF;
END $$;

-- =============================================================================
-- 17. Customer Reviews: public read approved; authenticated insert; no public update/delete
-- =============================================================================
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customer reviews public read approved" ON customer_reviews;
CREATE POLICY "Customer reviews public read approved" ON customer_reviews
    FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Customer reviews allow insert" ON customer_reviews;
CREATE POLICY "Customer reviews allow insert" ON customer_reviews
    FOR INSERT WITH CHECK (true);

-- Users can update their own pending reviews (e.g. re-upload image) but not change status
DROP POLICY IF EXISTS "Customer reviews update own pending" ON customer_reviews;
CREATE POLICY "Customer reviews update own pending" ON customer_reviews
    FOR UPDATE USING (user_id = auth.uid() AND status = 'pending')
    WITH CHECK (status = 'pending');

-- =============================================================================
-- 18. Provider Favourites: authenticated users CRUD their own favourites
-- =============================================================================
ALTER TABLE provider_favourites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider favourites select own" ON provider_favourites;
CREATE POLICY "Provider favourites select own" ON provider_favourites
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Provider favourites insert own" ON provider_favourites;
CREATE POLICY "Provider favourites insert own" ON provider_favourites
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Provider favourites delete own" ON provider_favourites;
CREATE POLICY "Provider favourites delete own" ON provider_favourites
    FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- Storage (Phase 2 + Phase 6): storage.objects
-- Phase 6: message attachments under vault/job_messages/{job_id}/... readable only by job participants
-- =============================================================================

-- Helper: true if path is under vault/job_messages/{job_id}/ and current user is job client or provider
CREATE OR REPLACE FUNCTION public.user_can_access_job_message_storage(obj_bucket_id TEXT, obj_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_uuid UUID;
BEGIN
  IF obj_bucket_id <> 'vault' OR obj_name IS NULL THEN
    RETURN false;
  END IF;
  -- Path format: job_messages/<uuid>/... (first segment after job_messages is job_id)
  IF obj_name NOT LIKE 'job_messages/%' THEN
    RETURN true; -- other vault paths keep default policy (e.g. public read or authenticated)
  END IF;
  BEGIN
    job_uuid := (regexp_match(obj_name, '^job_messages/([0-9a-fA-F-]{36})'))[1]::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = job_uuid AND (j.client_id = auth.uid() OR j.provider_id = auth.uid())
  );
END;
$$;

DROP POLICY IF EXISTS "Scandio storage public read" ON storage.objects;
DROP POLICY IF EXISTS "Scandio storage vault job messages participant read" ON storage.objects;
DROP POLICY IF EXISTS "Scandio storage authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "Scandio storage authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Scandio storage authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Scandio storage anon insert reviews gallery" ON storage.objects;

-- Public read for public buckets; vault job_messages/* only for job participants
CREATE POLICY "Scandio storage public read"
ON storage.objects FOR SELECT
USING (
  bucket_id IN ('avatars', 'banners', 'showcase', 'reviews', 'gallery')
  OR (bucket_id = 'vault' AND (name IS NULL OR name NOT LIKE 'job_messages/%'))
);

CREATE POLICY "Scandio storage vault job messages participant read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vault' AND name LIKE 'job_messages/%' AND user_can_access_job_message_storage(bucket_id, name));

CREATE POLICY "Scandio storage authenticated insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('avatars', 'banners', 'vault', 'showcase', 'reviews', 'gallery'));

-- Allow unauthenticated uploads to reviews and gallery (images are moderated before display)
CREATE POLICY "Scandio storage anon insert reviews gallery"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id IN ('reviews', 'gallery'));

CREATE POLICY "Scandio storage authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id IN ('avatars', 'banners', 'vault', 'showcase', 'reviews', 'gallery'))
WITH CHECK (bucket_id IN ('avatars', 'banners', 'vault', 'showcase', 'reviews', 'gallery'));

CREATE POLICY "Scandio storage authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('avatars', 'banners', 'vault', 'showcase', 'reviews', 'gallery'));

-- Gallery uploads: public read (approved only), public insert
ALTER TABLE gallery_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gallery uploads public read approved" ON gallery_uploads;
DROP POLICY IF EXISTS "Gallery uploads allow insert" ON gallery_uploads;
CREATE POLICY "Gallery uploads public read approved" ON gallery_uploads FOR SELECT USING (status = 'approved');
CREATE POLICY "Gallery uploads allow insert" ON gallery_uploads FOR INSERT WITH CHECK (true);
