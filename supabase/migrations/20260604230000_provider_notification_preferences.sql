-- Phase 9: per-Pro notification preferences, keyed by (provider_id, user_id) so
-- each teammate controls their own alerts. The realtime enquiry alert reads
-- new_enquiry alongside providers.notify_realtime.
CREATE TABLE IF NOT EXISTS public.provider_notification_preferences (
  provider_id       uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_enquiry       boolean NOT NULL DEFAULT true,
  new_review        boolean NOT NULL DEFAULT true,
  weekly_summary    boolean NOT NULL DEFAULT true,
  quiet_hours_start smallint CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end   smallint CHECK (quiet_hours_end BETWEEN 0 AND 23),
  preferred_channel text NOT NULL DEFAULT 'email'
                    CHECK (preferred_channel IN ('email', 'whatsapp', 'sms')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, user_id)
);

ALTER TABLE public.provider_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_notification_prefs_own" ON public.provider_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.provider_notification_preferences IS 'Per-teammate notification settings for a provider. Read by the realtime enquiry alert and the weekly summary.';
