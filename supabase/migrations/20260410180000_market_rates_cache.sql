-- Cached Google Custom Search snippets + optional Gemini-refined cost strings for Beta cost outlook.
-- Written/read only via service role from POST /api/market-rates/research.

create table if not exists public.market_rates_cache (
    cache_key text primary key,
    region_key text not null,
    trade_norm text not null,
    detail_key text not null,
    query_version integer not null default 1,
    fetched_at timestamptz not null,
    expires_at timestamptz not null,
    sources jsonb not null default '[]'::jsonb,
    model_context text,
    refined_costs jsonb,
    raw_bundle jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists market_rates_cache_expires_at_idx
    on public.market_rates_cache (expires_at);

alter table public.market_rates_cache enable row level security;
