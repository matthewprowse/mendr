-- Forward-compat for Layer 2 (brand/model specific estimates). variant_key = ''
-- is the Layer 1 baseline (one row per fault type); a brand/model slug will be a
-- Layer 2 row. Composite key keeps one baseline per fault and allows many brand
-- rows later. Table is empty, so this restructure is free.
ALTER TABLE public.cost_estimates
  ADD COLUMN IF NOT EXISTS variant_key text NOT NULL DEFAULT '';

ALTER TABLE public.cost_estimates DROP CONSTRAINT IF EXISTS cost_estimates_pkey;
ALTER TABLE public.cost_estimates ADD PRIMARY KEY (subcategory_id, variant_key);

COMMENT ON COLUMN public.cost_estimates.variant_key IS 'Empty string = Layer 1 baseline per fault type. A brand/model slug = Layer 2 brand-specific estimate (built later).';
