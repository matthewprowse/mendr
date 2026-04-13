-- Soft delete for providers; quota row first_seen for anonymous cleanup.

ALTER TABLE public.providers
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.diagnosis_usage
    ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.diagnosis_usage_preserve_first_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF tg_op = 'INSERT' THEN
        NEW.first_seen_at := COALESCE(NEW.first_seen_at, now());
    ELSIF tg_op = 'UPDATE' THEN
        NEW.first_seen_at := OLD.first_seen_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS diagnosis_usage_preserve_first_seen_trg ON public.diagnosis_usage;

CREATE TRIGGER diagnosis_usage_preserve_first_seen_trg
    BEFORE INSERT OR UPDATE ON public.diagnosis_usage
    FOR EACH ROW
    EXECUTE PROCEDURE public.diagnosis_usage_preserve_first_seen();
