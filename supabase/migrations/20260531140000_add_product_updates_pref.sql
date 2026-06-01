-- Opt-out flag for product update ("What's new") emails. Defaults true so
-- existing users receive announcements unless they turn them off.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS product_updates_enabled boolean NOT NULL DEFAULT true;
