-- Backend Security & Launch Readiness: storage hardening (C3, partial).
--
-- This is the SAFE subset of C3: it adds defence-in-depth size limits to every
-- bucket and makes the two buckets that have NO public-URL read sites in the
-- application private. The diagnosis and gallery buckets are NOT flipped here:
-- the app reads them via hand-built /object/public/ URLs in many places, so
-- privatising them requires a signed-URL migration across every read site,
-- tracked as the follow-up to this migration.
--
-- MIME allowlists are intentionally deferred: gallery legitimately stores
-- application/pdf (KYC IDs, registration certs) and several upload paths fall
-- back to application/octet-stream when the browser sends no content-type, so a
-- strict allowed_mime_types here would reject valid uploads. It will be set
-- once the upload paths are fixed to always send a real content-type.

-- Per-bucket size limits (bytes). Generous — the app compresses images before
-- upload, so these only stop abusive oversized objects.
UPDATE storage.buckets SET file_size_limit = 5242880   WHERE id = 'avatars';              -- 5 MB
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'banners';              -- 10 MB
UPDATE storage.buckets SET file_size_limit = 15728640  WHERE id = 'diagnosis';            -- 15 MB
UPDATE storage.buckets SET file_size_limit = 15728640  WHERE id = 'gallery';              -- 15 MB
UPDATE storage.buckets SET file_size_limit = 26214400  WHERE id = 'message-attachments';  -- 25 MB
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'reviews';              -- 10 MB
UPDATE storage.buckets SET file_size_limit = 15728640  WHERE id = 'showcase';             -- 15 MB
UPDATE storage.buckets SET file_size_limit = 26214400  WHERE id = 'vault';                -- 25 MB

-- Privatise the buckets that are never read through a public URL in the app.
-- Writes (service role) and any future signed-URL reads are unaffected.
UPDATE storage.buckets SET public = false WHERE id IN ('vault', 'message-attachments');
