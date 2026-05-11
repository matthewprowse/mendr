-- Cached retail/installed prices for individual parts and components.
-- Written/read only via service role from POST /api/parts-prices.
-- Cache TTL: 28 days (4 weeks). Deduplication via (part_name, variant, region_key) → cache_key.

create table if not exists public.parts_price_cache (
    cache_key   text primary key,
    -- Human-readable part name as supplied by the AI, e.g. "Capacitor replacement"
    part_name   text not null,
    -- Trade context used as the variant discriminator, e.g. "Security & Access"
    variant     text not null,
    region_key  text not null,
    query_version integer not null default 1,
    fetched_at  timestamptz not null,
    expires_at  timestamptz not null,
    -- Pricing output (ZAR, whole rands)
    price_min   numeric,
    price_max   numeric,
    price_display text,           -- e.g. "R150–R350" or null when unknown
    -- Raw search evidence for auditability
    sources     jsonb not null default '[]'::jsonb,
    updated_at  timestamptz not null default now()
);

create index if not exists parts_price_cache_expires_at_idx
    on public.parts_price_cache (expires_at);

create index if not exists parts_price_cache_lookup_idx
    on public.parts_price_cache (part_name, variant, region_key);

alter table public.parts_price_cache enable row level security;

comment on table public.parts_price_cache is
    'Per-part retail/installed price cache. Refreshed every 28 days. Keyed on part_name + variant (trade) + region.';
