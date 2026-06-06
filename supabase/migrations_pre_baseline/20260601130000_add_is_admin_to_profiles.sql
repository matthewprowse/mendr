-- Admin access flag. Replaces the shared ADMIN_PASSWORD gate with per-account
-- admin authorization: a logged-in user may access /admin only when their
-- profile has is_admin = true. Toggle in the Supabase dashboard or via the
-- service role; everyone else is redirected away from /admin.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_admin IS
    'When true, this user may access the /admin section. Service-role / dashboard managed.';
