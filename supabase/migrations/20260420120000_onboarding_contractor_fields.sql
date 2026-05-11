-- Contractor onboarding: type, pricing signal, Google place selection, KYC metadata.
-- Cache for Place Details (New) to cap API cost during onboarding.

alter table public.provider_applications
    add column if not exists contractor_type text
        check (contractor_type is null or contractor_type in ('individual', 'team', 'enterprise')),
    add column if not exists willingness_to_pay_band text,
    add column if not exists applicant_google_place_id text,
    add column if not exists kyc_documents jsonb,
    add column if not exists about text;

comment on column public.provider_applications.about is 'Free-text "about" / bio from contractor onboarding.';

comment on column public.provider_applications.contractor_type is 'Self-reported: individual, team, or enterprise — drives service-area limits in onboarding.';
comment on column public.provider_applications.willingness_to_pay_band is 'Applicant-selected monthly budget band for platform access (product research).';
comment on column public.provider_applications.applicant_google_place_id is 'Google Place resource id chosen during onboarding (Places API), if any.';
comment on column public.provider_applications.kyc_documents is 'Optional { idDocument?: {path,bucket}, selfie?: {path,bucket} } for manual review.';

create table if not exists public.onboarding_place_details_cache (
    place_id     text primary key,
    payload      jsonb not null,
    fetched_at   timestamptz not null default now()
);

create index if not exists onboarding_place_details_cache_fetched_at_idx
    on public.onboarding_place_details_cache (fetched_at desc);

alter table public.onboarding_place_details_cache enable row level security;
