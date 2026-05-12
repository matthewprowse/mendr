-- Migration: ai_cost_events
--
-- Tracks every Gemini API call made by the application: model name, token counts,
-- and an estimated USD cost. Used for:
--   1. Per-user cost visibility in the admin dashboard
--   2. Daily budget alerting (query daily totals and compare to threshold)
--   3. Post-launch optimisation — identify the most expensive call patterns
--
-- Cost estimation uses approximate multipliers stored in the application layer
-- (see src/lib/ai-cost-logger.ts). Update those constants when Google changes
-- its pricing rather than touching this schema.
--
-- Access: service_role only (no RLS needed — this is internal telemetry).

CREATE TABLE IF NOT EXISTS ai_cost_events (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- Which code path triggered this call
    endpoint         text        NOT NULL,

    -- Gemini model string, e.g. 'gemini-2.5-flash', 'gemini-2.0-flash-lite'
    model_name       text        NOT NULL,

    -- Optional linkage back to the user and conversation that triggered the call
    user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    conversation_id  text,

    -- Token counts from usageMetadata in the Gemini response
    prompt_tokens    integer     NOT NULL DEFAULT 0,
    completion_tokens integer    NOT NULL DEFAULT 0,
    total_tokens     integer     NOT NULL DEFAULT 0,

    -- Estimated cost in USD based on current Gemini pricing constants.
    -- Stored for quick dashboarding; re-derive from token counts if pricing changes.
    estimated_usd    numeric(12, 8) NOT NULL DEFAULT 0
);

-- Index for dashboard queries: daily totals, per-user costs
CREATE INDEX ai_cost_events_created_at_idx ON ai_cost_events (created_at DESC);
CREATE INDEX ai_cost_events_user_id_idx    ON ai_cost_events (user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX ai_cost_events_endpoint_idx   ON ai_cost_events (endpoint, created_at DESC);

-- Only the service role needs write access; no RLS policy needed.
ALTER TABLE ai_cost_events ENABLE ROW LEVEL SECURITY;
-- (no permissive policies — service_role bypasses RLS by default)

COMMENT ON TABLE  ai_cost_events IS 'One row per Gemini generateContent call. Used for cost monitoring and budget alerting.';
COMMENT ON COLUMN ai_cost_events.estimated_usd IS 'Approximate cost in USD. Based on token-count multipliers in src/lib/ai-cost-logger.ts — update multipliers when Google changes pricing.';
