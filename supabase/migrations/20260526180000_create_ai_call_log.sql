-- Phase 3 of the Diagnosis Architecture Hardening Plan.
-- See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 3
--
-- Captures every prompt sent to Gemini and every response received, in a
-- queryable store. Powers Phase 5's prompt-restructure regression check and
-- the Phase 9 "conversation detail" dashboard view.
--
-- Retention: 90 days. Pruned by a weekly cron (src/app/api/cron/prune-ai-call-log).
-- Privacy: images are NOT stored here (they live in storage already). Text
-- prompts (which contain user descriptions) are stored. The table is
-- internal-only — no RLS-exposed public reader.

CREATE TABLE IF NOT EXISTS public.ai_call_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- FK to public.diagnoses(id). Nullable because some warm-up calls
    -- (image_thought_only) and some refine retries may not have a row yet.
    conversation_id     uuid REFERENCES public.diagnoses(id) ON DELETE SET NULL,

    -- Which logical agent produced this call.
    agent_id            text NOT NULL CHECK (agent_id IN ('2a', '2b', '2c', '3-critique')),

    -- Prompt sent (full assembled system instruction + user contents,
    -- serialised to text). Images are referenced by URL only, not embedded.
    prompt_text         text NOT NULL,
    prompt_version      text,

    -- Model + generation parameters
    model_id            text NOT NULL,
    temperature         numeric,
    top_p               numeric,
    top_k               integer,

    -- Response captured
    response_text       text,
    response_json       jsonb,

    -- Performance + cost
    latency_ms          integer,
    input_tokens        integer,
    output_tokens       integer,

    -- Error (if any). Non-null implies a failed call, in which case
    -- response_text/response_json may be null.
    error               text
);

-- Lookups by conversation are the hottest read pattern (per-row dashboard drilldown).
CREATE INDEX IF NOT EXISTS ai_call_log_conversation_id_idx
    ON public.ai_call_log (conversation_id);

-- Pruning needs to find rows older than now()-90 days efficiently.
CREATE INDEX IF NOT EXISTS ai_call_log_created_at_idx
    ON public.ai_call_log (created_at);

COMMENT ON TABLE public.ai_call_log IS
    'Phase 3 of Diagnosis Architecture Hardening Plan. One row per Gemini call across agents 2a/2b/2c/3-critique. Pruned at 90 days.';
COMMENT ON COLUMN public.ai_call_log.prompt_text IS
    'Full assembled prompt text. Images are referenced by URL — never inlined.';
COMMENT ON COLUMN public.ai_call_log.response_json IS
    'Parsed structured output when the call returned valid JSON; null on parse failure.';
