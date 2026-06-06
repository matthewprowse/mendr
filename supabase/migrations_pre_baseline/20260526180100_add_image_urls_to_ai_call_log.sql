-- Phase 3 follow-up: capture image URLs alongside the prompt so every logged
-- Gemini call can be replayed against the real photos.
--
-- Decision context: the original Phase 3 plan said "images are not logged".
-- During review on 2026-05-26 we decided to override that — URLs (not raw
-- bytes) give us replayability without ballooning storage. Bytes still live
-- in Supabase Storage and are referenced by the URLs stored here.

ALTER TABLE public.ai_call_log
    ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.ai_call_log.image_urls IS
    'Image URLs the model saw on this call. Bytes are NOT inlined — fetch via Supabase storage. Empty array on text-only calls.';
