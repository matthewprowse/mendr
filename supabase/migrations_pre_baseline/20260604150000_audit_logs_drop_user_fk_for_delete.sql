-- Second account-deletion blocker (after the diagnoses FK fix).
--
-- audit_logs.user_id was ON DELETE SET NULL, but audit_logs has an append-only
-- trigger (audit_logs_deny_update_delete_trigger) that rejects any UPDATE or
-- DELETE. Deleting a user therefore tried to NULL their audit_logs.user_id rows,
-- the trigger raised "audit_logs are append-only", and the whole delete aborted
-- with a 500.
--
-- An immutable audit trail should retain the original actor id even after the
-- user is deleted, so the correct fix is to drop the foreign key: account
-- deletion no longer touches audit_logs at all, and the historical user_id
-- remains as a plain (now-dangling) reference, which is expected for a log.

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
