-- AI model pricing table.
--
-- Replaces the hardcoded PRICING constant in src/lib/ai/ai-cost-logger.ts.
-- Every change to Gemini rates is captured as a new row; the old row is
-- closed out with `effective_until = now()` so the full price history is
-- always queryable. Cost reconciliation against monthly Google invoices
-- depends on accurate history when prices change mid-month.

CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name                  text NOT NULL,
  input_per_1m_usd            numeric(10, 6) NOT NULL,
  output_per_1m_usd           numeric(10, 6) NOT NULL,
  cached_input_per_1m_usd     numeric(10, 6),
  effective_from              timestamptz NOT NULL DEFAULT now(),
  effective_until             timestamptz,  -- NULL = currently active
  source                      text NOT NULL DEFAULT 'manual',  -- 'manual' | 'google-pricing-page' | 'reconciliation'
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id)  -- nullable for system inserts
);

CREATE INDEX IF NOT EXISTS ai_model_pricing_model_active_idx
  ON public.ai_model_pricing (model_name) WHERE effective_until IS NULL;

CREATE INDEX IF NOT EXISTS ai_model_pricing_model_history_idx
  ON public.ai_model_pricing (model_name, effective_from DESC);

ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; restrict regular reads to admins only via separate policy if needed later.
CREATE POLICY "ai_model_pricing_admin_select" ON public.ai_model_pricing
  FOR SELECT TO authenticated
  USING (false);  -- locked down; we'll widen if/when we build admin UI

COMMENT ON TABLE public.ai_model_pricing IS
  'Per-model Gemini pricing rates with full history. Active rates have effective_until IS NULL. Service role reads only.';
COMMENT ON COLUMN public.ai_model_pricing.input_per_1m_usd IS
  'USD cost per 1,000,000 input tokens.';
COMMENT ON COLUMN public.ai_model_pricing.output_per_1m_usd IS
  'USD cost per 1,000,000 output (candidate) tokens.';
COMMENT ON COLUMN public.ai_model_pricing.cached_input_per_1m_usd IS
  'USD cost per 1,000,000 cached input tokens. NULL when the model has no context-cache pricing tier.';

-- Seed with current rates from the hardcoded PRICING table in ai-cost-logger.ts.
INSERT INTO public.ai_model_pricing (model_name, input_per_1m_usd, output_per_1m_usd, cached_input_per_1m_usd, source, notes) VALUES
  ('gemini-2.5-flash',         0.300000, 1.000000, NULL,     'manual', 'Initial seed from hardcoded PRICING table'),
  ('gemini-2.5-flash-preview', 0.300000, 1.000000, NULL,     'manual', 'Initial seed from hardcoded PRICING table'),
  ('gemini-3.5-flash',         1.500000, 9.000000, 0.150000, 'manual', 'Initial seed from hardcoded PRICING table — verified May 2026'),
  ('gemini-2.0-flash',         0.100000, 0.400000, NULL,     'manual', 'Initial seed from hardcoded PRICING table'),
  ('gemini-2.0-flash-lite',    0.075000, 0.300000, NULL,     'manual', 'Initial seed from hardcoded PRICING table');
