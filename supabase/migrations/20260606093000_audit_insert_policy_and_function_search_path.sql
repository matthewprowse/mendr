-- Backend Security & Launch Readiness: M8 + M9.

-- M8: the audit_logs INSERT policy was WITH CHECK (true), so any client could
-- forge audit entries attributed to anyone. Restrict it so an authenticated
-- caller may only insert rows for themselves. The only client-side writer logs
-- the signing-out user's own event; all other audit writes use the service role
-- (which bypasses RLS). auth.uid() is wrapped in a scalar subquery so it is
-- evaluated once, not per row (the M14 initplan pattern).
DROP POLICY IF EXISTS "Audit logs allow insert" ON public.audit_logs;
CREATE POLICY "Audit logs insert own" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- M9: pin a non-mutable search_path on the flagged functions. For the
-- SECURITY DEFINER ones this closes a privilege-escalation vector (an attacker
-- can no longer shadow an unqualified reference via an earlier schema in the
-- definer's path). public is pinned; pg_catalog is always searched implicitly.
ALTER FUNCTION public.canonical_primary_trade(jsonb)            SET search_path = public;
ALTER FUNCTION public.diagnosis_is_committed(diagnoses)         SET search_path = public;
ALTER FUNCTION public.diagnosis_is_first_pass(diagnoses)        SET search_path = public;
ALTER FUNCTION public.diagnosis_usage_preserve_first_seen()     SET search_path = public;
ALTER FUNCTION public.increment_diagnosis_quota(uuid, text, date) SET search_path = public;
ALTER FUNCTION public.job_outcomes_after_change()              SET search_path = public;
ALTER FUNCTION public.next_invoice_seq(uuid)                   SET search_path = public;
ALTER FUNCTION public.recompute_mendr_rating(uuid)            SET search_path = public;
ALTER FUNCTION public.set_primary_trade()                     SET search_path = public;
