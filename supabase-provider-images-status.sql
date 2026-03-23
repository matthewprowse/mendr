-- Gallery moderation for `provider_images`
-- ---------------------------------------------------------------------------
-- Storage: Supabase Storage bucket `gallery`. Each row stores `bucket` + `path`;
-- public URL: {NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
--
-- User uploads (API POST /api/providers/[id]/gallery) use source = 'user',
-- status = 'pending' until you approve in Supabase (or build an admin UI).
-- Google/website sync sets source = 'google' | 'website', status = 'approved'.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'provider_images'
          AND column_name = 'status'
    ) THEN
        ALTER TABLE public.provider_images ADD COLUMN status text;
    END IF;
END $$;

UPDATE public.provider_images SET status = 'approved' WHERE status IS NULL;

ALTER TABLE public.provider_images ALTER COLUMN status SET DEFAULT 'approved';
ALTER TABLE public.provider_images ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.provider_images DROP CONSTRAINT IF EXISTS provider_images_status_check;

ALTER TABLE public.provider_images
    ADD CONSTRAINT provider_images_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.provider_images.status IS
    'pending = awaiting moderation; approved = visible in public gallery; rejected = hidden';
