-- Fix account deletion (POST /api/account/delete returning 500).
--
-- `diagnoses.user_id` referenced auth.users with ON DELETE NO ACTION (legacy
-- constraint name `conversations_user_id_fkey`), so deleting any user who had
-- ever created a diagnosis raised a foreign-key violation and the admin
-- deleteUser call failed. Every other user-linked content table (ai_cost_events,
-- audit_logs, reviews, transcriptions, provider_applications, whatsapp_sessions)
-- already uses ON DELETE SET NULL. Align diagnoses with that convention: the
-- diagnosis row is retained but unlinked from the deleted user. user_id is
-- already nullable (anonymous diagnoses store NULL).

ALTER TABLE public.diagnoses
  DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

ALTER TABLE public.diagnoses
  ADD CONSTRAINT conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
