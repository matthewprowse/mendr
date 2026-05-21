-- Remove tables for features stripped from the application.

-- FK from diagnoses → diagnosis_urgencies must be dropped first.
ALTER TABLE public.diagnoses DROP CONSTRAINT IF EXISTS conversations_urgency_key_fkey;

-- Diagnosis urgencies: classifier output (urgency_key) was never displayed or used for matching.
DROP TABLE IF EXISTS public.diagnosis_urgencies;

-- Market rates cache: cost estimation removed. API was firing on every diagnosis despite
-- UI being hidden (SHOW_COST_ESTIMATE_UI = false), burning Brave Search + Gemini quota.
DROP TABLE IF EXISTS public.market_rates_cache;

-- Parts price cache: companion cache to market_rates_cache, also removed.
DROP TABLE IF EXISTS public.parts_price_cache;

-- Services: 12-row label catalog queried by getServices() which had no active callers.
-- All classification is driven by TypeScript taxonomy files (diagnosis-trade-taxonomy.ts).
DROP TABLE IF EXISTS public.services;

-- Messages: legacy GPT-wrapper chat history from pre-refactor streaming interface (/app/chat/).
-- New diagnosis flow uses the diagnoses table only. Pre-launch — no real users affected.
DROP TABLE IF EXISTS public.messages;
