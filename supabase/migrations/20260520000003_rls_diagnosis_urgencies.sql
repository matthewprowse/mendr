-- RLS for diagnosis_urgencies.
-- This is a reference/catalog table. Public read-only — no client writes.

ALTER TABLE public.diagnosis_urgencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY diagnosis_urgencies_public_select
    ON public.diagnosis_urgencies
    FOR SELECT
    TO anon, authenticated
    USING (true);
