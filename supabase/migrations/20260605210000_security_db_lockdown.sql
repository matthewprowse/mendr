-- Backend Security & Launch Readiness: database & schema lockdown.
-- Findings C1, C2, H2, H3 (database half), H4, H6 from
-- docs/Backend Security And Launch Readiness Plan.md.
--
-- Every RPC touched here is invoked only via the service_role key from
-- server-side Next.js routes (verified against the call sites), so revoking the
-- anon / authenticated / PUBLIC grants does not change application behaviour.
-- The grant to service_role is left intact. Statements are written to be
-- idempotent so the migration is safe to re-run.

-- C1: get_user_id_by_email is an account-enumeration oracle (email -> user id).
-- Default function grant is to PUBLIC, so PUBLIC must be revoked, not just the
-- two named roles.
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;

-- C2: user_home_stats(uuid) takes an arbitrary user id and returns that user's
-- diagnoses, titles and home address with no auth.uid() check. Kept
-- service_role-only; the /home route resolves identity from the authenticated
-- session (supabase.auth.getUser) before calling it.
REVOKE EXECUTE ON FUNCTION public.user_home_stats(uuid) FROM PUBLIC, anon, authenticated;

-- H2: run_data_layer_maintenance() deletes from provider_cache and
-- diagnosis_usage; an anonymous caller could wipe everyone's quota records.
REVOKE EXECUTE ON FUNCTION public.run_data_layer_maintenance() FROM PUBLIC, anon, authenticated;

-- H3 (database half): increment_diagnosis_quota could be called directly by any
-- anon caller to inflate another user's count (denial of service) or skip their
-- own. Revoke direct access; the cookie-signing and server-side first-message
-- logic are hardened separately in the application layer.
REVOKE EXECUTE ON FUNCTION public.increment_diagnosis_quota(uuid, text, date) FROM PUBLIC, anon, authenticated;

-- H4: ai_call_log holds raw Gemini prompts and image URLs but had RLS disabled,
-- making it readable through PostgREST with the anon key. Only the service_role
-- (which bypasses RLS) writes and prunes it, so no policy is required.
ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;

-- H4: drop dead backup tables. They are full copies of provider data left with
-- RLS off and were never meant to be exposed.
DROP TABLE IF EXISTS public.providers_backup_20260601;
DROP TABLE IF EXISTS public.provider_cache_backup_20260601;

-- H6: these two analytics views ran as SECURITY DEFINER and therefore bypassed
-- RLS on the underlying diagnoses table for any grantee. security_invoker makes
-- them evaluate the querying role's RLS instead.
ALTER VIEW public.diagnosis_outcomes SET (security_invoker = true);
ALTER VIEW public.diagnosis_clarification_stats SET (security_invoker = true);
