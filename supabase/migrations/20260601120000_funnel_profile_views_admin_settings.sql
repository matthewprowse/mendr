-- Phase 1 of the durable analytics rebuild.
--
-- Replaces the fragile client-side `diagnosis_events` funnel (which stopped
-- producing rows on 2026-04-26 and never recorded the entry or completion
-- stages) with durable, server-written state keyed by diagnosis_id. One fault
-- equals one diagnosis equals one journey, so diagnosis_id is the journey key
-- and we do not depend on the analytics session_id.
--
-- Three tables:
--   1. diagnosis_funnel        — 1:1 with diagnoses, the canonical funnel.
--   2. provider_profile_views  — per-provider view metric (NOT a funnel stage).
--   3. admin_settings          — key/value admin config (e.g. monthly AI budget).
--
-- No backfill and no deletion: the funnel collects from go-live forward.
-- All three tables are written by server routes using the service role, which
-- bypasses RLS. RLS is enabled with no permissive policy so anon/authenticated
-- clients have no access.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. diagnosis_funnel — canonical per-diagnosis funnel state.
--    Stage 1 (Started) is diagnoses.created_at; the remaining stages are stamped
--    server-side as the user progresses.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diagnosis_funnel (
  diagnosis_id      uuid PRIMARY KEY REFERENCES public.diagnoses(id) ON DELETE CASCADE,
  delivered_at      timestamptz,                       -- AI diagnosis finalized
  matches_shown_at  timestamptz,                       -- first non-empty provider result set
  match_count       integer NOT NULL DEFAULT 0,        -- providers shown at matches_shown_at
  first_contact_at  timestamptz,                       -- first contractor contact (mirrored from provider_contact_events)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnosis_funnel_delivered_idx
  ON public.diagnosis_funnel (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS diagnosis_funnel_matches_idx
  ON public.diagnosis_funnel (matches_shown_at) WHERE matches_shown_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS diagnosis_funnel_contact_idx
  ON public.diagnosis_funnel (first_contact_at) WHERE first_contact_at IS NOT NULL;

ALTER TABLE public.diagnosis_funnel ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.diagnosis_funnel IS
  'Durable per-diagnosis funnel state, written server-side. Stages: Started (diagnoses.created_at), Diagnosis Delivered (delivered_at), Matches Shown (matches_shown_at), Contacted (first_contact_at). Service role writes only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. provider_profile_views — per-provider view metric.
--    A profile view is a side branch, not a funnel stage: a lead can be
--    generated without ever opening a profile. Honest view counts use
--    COUNT(DISTINCT session_id); the client fires at most once per session.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_profile_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  diagnosis_id  uuid REFERENCES public.diagnoses(id) ON DELETE SET NULL,  -- null for public contractor-page views
  session_id    text,                                                     -- for distinct-view counting
  source        text,                                                     -- 'match' | 'contractor_page'
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_profile_views_provider_idx
  ON public.provider_profile_views (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_profile_views_diagnosis_idx
  ON public.provider_profile_views (diagnosis_id) WHERE diagnosis_id IS NOT NULL;

ALTER TABLE public.provider_profile_views ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.provider_profile_views IS
  'Per-provider profile-view log. Feeds the admin Providers view count and the contractor views-vs-leads metric. Not a funnel stage. Distinct views via COUNT(DISTINCT session_id). Service role writes only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. admin_settings — generic key/value admin config.
--    First use is the monthly AI budget (display + alerting only; never throttles
--    calls). Stored as jsonb so future settings can hold richer shapes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_settings IS
  'Key/value admin configuration (e.g. ai_monthly_budget_usd). Service role reads and writes only.';
