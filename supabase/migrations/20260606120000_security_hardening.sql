-- Security + integrity hardening from the Supabase advisor review (production
-- readiness). Each change was validated against live data before writing:
--   * 0 orphaned providers.claimed_by_user_id  -> FK is safe to add
--   * user_can_access_job_message_storage is used by a storage.objects RLS
--     policy -> intentionally NOT revoked (revoking would break storage access)
--   * platform_home_stats / conversation_visible_to_user / recompute_mendr_rating
--     are only ever called server-side (service_role) or by triggers
--   * audit_logs has a redundant USING(false) SELECT policy alongside the real one

-- 1. Lock down SECURITY DEFINER functions that PostgREST exposed to anon/auth.
--    Trigger functions still fire (triggers run them as owner regardless of grant).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_pending_provider_members() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.diagnoses_archive_before_update() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_outcomes_after_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_logs_deny_update_delete() FROM anon, authenticated, PUBLIC;

-- Callable internal helpers: keep server (service_role) access, drop public API.
REVOKE EXECUTE ON FUNCTION public.platform_home_stats() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.platform_home_stats() TO service_role;
REVOKE EXECUTE ON FUNCTION public.conversation_visible_to_user(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.conversation_visible_to_user(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recompute_mendr_rating(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recompute_mendr_rating(uuid) TO service_role;

-- 4. Add the missing FK so deleting a user cannot orphan business ownership.
ALTER TABLE public.providers
  ADD CONSTRAINT providers_claimed_by_user_id_fkey
  FOREIGN KEY (claimed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Make issued invoices immutable at the database (money integrity). Recording
--    payments stays allowed; the number, totals, and issue stamp are frozen.
CREATE OR REPLACE FUNCTION public.invoices_block_issued_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    IF NEW.number     IS DISTINCT FROM OLD.number
    OR NEW.subtotal   IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.total      IS DISTINCT FROM OLD.total
    OR NEW.issued_at  IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'Issued invoice % is immutable: number, totals and issued_at cannot change (use a credit note)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_block_issued_edits ON public.invoices;
CREATE TRIGGER invoices_block_issued_edits
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_block_issued_edits();

-- 6. Drop the redundant audit_logs SELECT policy (USING(false) is a no-op next to
--    the real "own or service" policy; removing it clears the perf lint and the
--    effective access is unchanged — anon still gets nothing).
DROP POLICY IF EXISTS "Audit logs no anon read" ON public.audit_logs;
