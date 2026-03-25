-- =============================================================================
-- Scandio — Row Level Security (RLS) policies
-- =============================================================================
-- Convention:
--   • Server-side code uses the service_role key (bypasses RLS entirely).
--   • The anon / authenticated roles should only ever READ public data.
--   • Mutation (INSERT / UPDATE / DELETE) is restricted to the service role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- services  (public read)
-- ---------------------------------------------------------------------------
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services: public read"
    ON services FOR SELECT
    USING (true);

-- ---------------------------------------------------------------------------
-- conversations  (owner read/write via anon key — no auth yet)
-- Conversations are identified by UUID only (no user auth currently).
-- Allow full access so the client can upsert/read its own conversations.
-- ---------------------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: full access for anon"
    ON conversations
    USING (true)
    WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- providers  (public read; writes via service role only)
-- ---------------------------------------------------------------------------
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers: public read"
    ON providers FOR SELECT
    USING (true);

-- Service role writes are automatic (RLS bypassed for service_role).

-- ---------------------------------------------------------------------------
-- reviews  (public read of approved; own writes via anon key)
-- ---------------------------------------------------------------------------
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews: read approved"
    ON reviews FOR SELECT
    USING (status = 'approved' OR source = 'google');

CREATE POLICY "reviews: insert via anon (pending)"
    ON reviews FOR INSERT
    WITH CHECK (source = 'scandio' AND status = 'pending');

-- ---------------------------------------------------------------------------
-- provider_images  (public read)
-- ---------------------------------------------------------------------------
ALTER TABLE provider_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_images: public read"
    ON provider_images FOR SELECT
    USING (true);

-- ---------------------------------------------------------------------------
-- provider_search_cache  (no direct client access)
-- All reads and writes go through the server (service_role). Deny all for anon.
-- ---------------------------------------------------------------------------
ALTER TABLE provider_search_cache ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.
-- Service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- provider_cache  (no direct client access)
-- ---------------------------------------------------------------------------
ALTER TABLE provider_cache ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.

-- ---------------------------------------------------------------------------
-- provider_rotation_tokens  (no direct client access)
-- Token state is managed entirely server-side. Deny all for anon.
-- ---------------------------------------------------------------------------
ALTER TABLE provider_rotation_tokens ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.

-- ---------------------------------------------------------------------------
-- directions_cache  (no direct client access)
-- ---------------------------------------------------------------------------
ALTER TABLE directions_cache ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.

-- ---------------------------------------------------------------------------
-- provider_contact_events  (no direct client access)
-- ---------------------------------------------------------------------------
ALTER TABLE provider_contact_events ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.

-- ---------------------------------------------------------------------------
-- ai_logs  (no direct client access)
-- ---------------------------------------------------------------------------
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

-- No policy = deny all for non-service-role callers.
