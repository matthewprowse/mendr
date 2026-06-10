-- WhatsApp Phase C: real-channel launch support.
--
-- New tables (all RLS-enabled with NO anon/authenticated policies — the bot
-- and cron are trusted server-side actors using the service role, matching
-- whatsapp_sessions):
--   whatsapp_link_tokens     — hashed magic-link / OTP tokens for phone↔account linking
--   whatsapp_opt_outs        — numbers that replied STOP (suppresses proactive sends)
--   whatsapp_outbox_failures — dead-letter for sends that exhausted retries
--   whatsapp_followups       — scheduled proactive sends (job follow-ups)
-- Plus: session hygiene index, resume-nudge bookkeeping, and a uniqueness
-- guarantee on verified phones.

-- ── Linking tokens ───────────────────────────────────────────────────────────

create table public.whatsapp_link_tokens (
    id uuid primary key default gen_random_uuid(),
    token_hash text not null,
    phone_number text not null,
    kind text not null check (kind in ('magic_link', 'otp')),
    created_for uuid references public.profiles(id) on delete cascade,
    consumed_by uuid references public.profiles(id) on delete set null,
    attempts integer not null default 0,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.whatsapp_link_tokens is
    'Hashed (sha256) magic-link and OTP tokens binding a WhatsApp phone number to a Mendr account. Possession of the phone is the proof: magic links are minted in-chat; OTPs are delivered via the link_account_otp template.';

create unique index whatsapp_link_tokens_token_hash_idx
    on public.whatsapp_link_tokens (token_hash);
create index whatsapp_link_tokens_lookup_idx
    on public.whatsapp_link_tokens (kind, created_for, consumed_at);
create index whatsapp_link_tokens_expires_idx
    on public.whatsapp_link_tokens (expires_at);

alter table public.whatsapp_link_tokens enable row level security;

-- ── Opt-outs ─────────────────────────────────────────────────────────────────

create table public.whatsapp_opt_outs (
    phone_number text primary key,
    created_at timestamptz not null default now()
);

comment on table public.whatsapp_opt_outs is
    'Numbers that replied STOP. Suppresses proactive sends (templates, nudges); user-initiated conversations are still answered per WhatsApp policy. Cleared by an explicit START.';

alter table public.whatsapp_opt_outs enable row level security;

-- ── Outbox dead-letter ───────────────────────────────────────────────────────

create table public.whatsapp_outbox_failures (
    id uuid primary key default gen_random_uuid(),
    phone_number text not null,
    kind text not null,
    payload jsonb,
    error text,
    http_status integer,
    replayed_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.whatsapp_outbox_failures is
    'Outbound WhatsApp sends that exhausted retries, plus failed delivery status callbacks. A failed template send is a lost lead or follow-up — review and replay manually.';

create index whatsapp_outbox_failures_created_idx
    on public.whatsapp_outbox_failures (created_at desc);

alter table public.whatsapp_outbox_failures enable row level security;

-- ── Scheduled follow-ups ─────────────────────────────────────────────────────

create table public.whatsapp_followups (
    id uuid primary key default gen_random_uuid(),
    phone_number text not null,
    user_id uuid references public.profiles(id) on delete cascade,
    kind text not null check (kind in ('job_followup')),
    payload jsonb,
    due_at timestamptz not null,
    sent_at timestamptz,
    send_ok boolean,
    created_at timestamptz not null default now()
);

comment on table public.whatsapp_followups is
    'Proactive template sends scheduled by the bot (e.g. "did the contractor sort it out?" ~5 days after contact). Processed by /api/cron/whatsapp; the outbox suppresses opted-out numbers.';

create index whatsapp_followups_due_idx
    on public.whatsapp_followups (due_at) where sent_at is null;

alter table public.whatsapp_followups enable row level security;

-- ── Session hygiene + resume bookkeeping ─────────────────────────────────────

alter table public.whatsapp_sessions
    add column resume_prompted_at timestamptz;

comment on column public.whatsapp_sessions.resume_prompted_at is
    'Set when the resume_diagnosis template was sent for the current stall; prevents repeat nudges. Reset on session reset.';

create index whatsapp_sessions_last_message_idx
    on public.whatsapp_sessions (last_message_at);

-- ── Verified phone uniqueness ────────────────────────────────────────────────
-- A verified phone may belong to at most one profile; unverified duplicates
-- remain allowed (numbers are captured unverified during onboarding).

create unique index profiles_verified_phone_unique_idx
    on public.profiles (phone)
    where phone is not null and phone_verified_at is not null;
