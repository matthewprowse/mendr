-- RLS for provider_applications.
-- Applicants can submit (insert) via the public form using the anon key.
-- No client-side reads — all reads go through the service_role (admin dashboard, cron jobs).

ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

-- Allow the public application form to submit a new application.
CREATE POLICY provider_applications_insert_anon
    ON public.provider_applications
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- No SELECT, UPDATE, or DELETE policies for anon/authenticated.
-- Service_role bypasses RLS and retains full access.
