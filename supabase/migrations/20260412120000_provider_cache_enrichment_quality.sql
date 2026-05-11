-- Optional: enrichment QA gate — 'low' rows retry sooner (see provider-enrichment.ts).
alter table public.provider_cache
    add column if not exists enrichment_quality text;

alter table public.provider_cache
    drop constraint if exists provider_cache_enrichment_quality_check;

alter table public.provider_cache
    add constraint provider_cache_enrichment_quality_check
    check (enrichment_quality is null or enrichment_quality in ('ok', 'low'));

comment on column public.provider_cache.enrichment_quality is
    'ok = passed QA; low = AI output failed quality gate — shorter retry window';
