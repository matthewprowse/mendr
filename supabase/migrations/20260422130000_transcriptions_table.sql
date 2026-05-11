create table if not exists public.transcriptions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid references auth.users(id) on delete set null,
    source text,
    status text not null check (status in ('ok', 'error')),
    transcript text,
    error_message text,
    audio_mime_type text,
    audio_bytes integer check (audio_bytes is null or audio_bytes >= 0),
    language_code text not null default 'en-ZA',
    duration_ms integer not null default 0 check (duration_ms >= 0)
);

create index if not exists transcriptions_created_at_idx
    on public.transcriptions (created_at desc);

create index if not exists transcriptions_user_id_created_at_idx
    on public.transcriptions (user_id, created_at desc);

alter table public.transcriptions enable row level security;
