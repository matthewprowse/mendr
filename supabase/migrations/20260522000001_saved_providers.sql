-- Homeowner-saved contractor profiles.
-- provider_id is the page identifier (provider UUID or Google Place ID) used in /contractors/[id].
create table if not exists saved_providers (
    id          uuid        primary key default gen_random_uuid(),
    user_id     uuid        not null references auth.users(id) on delete cascade,
    provider_id text        not null,
    created_at  timestamptz not null default now(),
    constraint saved_providers_user_provider_unique unique (user_id, provider_id)
);

alter table saved_providers enable row level security;

create policy "Users manage their own saves"
    on saved_providers
    for all
    using  (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index saved_providers_user_id_idx on saved_providers (user_id);
