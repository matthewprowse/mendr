-- Feature announcements ("What's new") shown on the customer home page and at
-- /whats-new. Rows are authored directly (e.g. via the Supabase MCP) — no
-- deploy is needed to publish an update. A row goes live when published_at is
-- set and not in the future; NULL published_at is a draft.

CREATE TABLE IF NOT EXISTS public.feature_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  summary       text,                       -- one-line teaser for the feed
  body          text,                       -- full markdown for the detail page
  image_url     text,
  published_at  timestamptz,                -- NULL = draft
  email_sent_at timestamptz,               -- set once the announcement email goes out
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_announcements_published_idx
  ON public.feature_announcements (published_at DESC)
  WHERE published_at IS NOT NULL;

ALTER TABLE public.feature_announcements ENABLE ROW LEVEL SECURITY;

-- Anyone may read published announcements. Drafts and writes stay service-role only.
CREATE POLICY "feature_announcements_public_read" ON public.feature_announcements
  FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL AND published_at <= now());

COMMENT ON TABLE public.feature_announcements IS
  'Product update / "What''s new" entries surfaced on the home page and /whats-new. Published when published_at is set and not in the future.';
