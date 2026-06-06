-- Backend Security & Launch Readiness: C4 / C5 (diagnosis IDOR).
--
-- Anonymous diagnoses are created before a user signs in, so they cannot be
-- bound to auth.uid(). Bind them instead to the caller's scandio_anon cookie
-- so the GET/PATCH routes can verify ownership for both authenticated and
-- anonymous owners. The column is null for legacy rows and for rows owned by an
-- authenticated user (those are gated on user_id).

ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS anon_key text;

COMMENT ON COLUMN public.diagnoses.anon_key IS
  'scandio_anon cookie value that owns this row while user_id is null. Lets an anonymous owner read/update their own diagnosis without authenticating; superseded by user_id once the row is claimed by a signed-in user.';

-- Partial index: anon ownership lookups only ever filter on non-null keys.
CREATE INDEX IF NOT EXISTS diagnoses_anon_key_idx
  ON public.diagnoses (anon_key) WHERE anon_key IS NOT NULL;
