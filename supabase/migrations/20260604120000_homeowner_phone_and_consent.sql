-- Phase 1 of the Homeowner Onboarding And Pro Portal Plan.
--
-- Captures the homeowner's mobile number (the asset the Pro lead model depends
-- on) and their global lead-share consent preference. The number is stored
-- UNVERIFIED for now (phone_verified_at stays NULL); SMS/WhatsApp OTP is added
-- later, at which point phone_verified_at gets stamped. Keeping the column now
-- means enabling verification later is a code change, not a migration.

-- 1. Phone columns on profiles. Additive and nullable so existing rows are
--    untouched. The number is stored normalised to 27XXXXXXXXX at write time.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.phone IS
  'Homeowner mobile, normalised to 27XXXXXXXXX. Captured at onboarding, shared with a Pro on consent. Stored unverified until OTP is enabled.';
COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Set when the number passes OTP verification. NULL = captured but unverified.';

-- 2. Global lead-share consent preference, one row per homeowner.
--    'ask_each_time' (default) shows the per-contact consent modal; the modal's
--    "do not ask again" checkbox flips this to 'always_share'. Revocable from
--    settings. The per-contact audit trail lives in lead_contact_consents
--    (added in Phase 3); this table is only the global toggle.
CREATE TABLE IF NOT EXISTS public.lead_share_consent_settings (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode       text NOT NULL DEFAULT 'ask_each_time'
             CHECK (mode IN ('ask_each_time', 'always_share')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_share_consent_settings ENABLE ROW LEVEL SECURITY;

-- A homeowner reads and writes only their own row. Service role bypasses RLS
-- for server-side writes.
CREATE POLICY "lead_share_consent_settings_select_own"
  ON public.lead_share_consent_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "lead_share_consent_settings_insert_own"
  ON public.lead_share_consent_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lead_share_consent_settings_update_own"
  ON public.lead_share_consent_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.lead_share_consent_settings IS
  'Per-homeowner global lead-share consent mode. ask_each_time shows the per-contact modal; always_share skips it. Revocable from settings.';
