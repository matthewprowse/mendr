-- Add cached_tokens to ai_cost_events.
--
-- Gemini reports cachedContentTokenCount: prompt tokens served from the context
-- cache, billed at the (cheaper) cached input rate. We already use this value to
-- price each call; this column persists it so the cached split is auditable and
-- reportable alongside prompt/completion/total tokens.

ALTER TABLE public.ai_cost_events
    ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_cost_events.cached_tokens IS
    'Prompt tokens served from Gemini context cache (cachedContentTokenCount). Billed at the cached input rate; a subset of prompt_tokens.';
