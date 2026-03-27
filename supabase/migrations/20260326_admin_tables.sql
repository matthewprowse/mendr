-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: admin tables
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Provider waitlist ──────────────────────────────────────────────────────

create table if not exists provider_waitlist (
    id                uuid        primary key default gen_random_uuid(),
    created_at        timestamptz not null    default now(),
    name              text        not null,
    business_name     text,
    trade             text        not null,
    phone             text        not null,
    email             text        not null    unique,
    areas             text        not null,
    years_experience  integer,
    message           text,
    status            text        not null    default 'new'
                                  check (status in ('new', 'contacted', 'approved', 'rejected')),
    notes             text,
    sendgrid_sent_at  timestamptz,
    source            text
);

-- ── 2. Diagnosis events (analytics funnel) ────────────────────────────────────

create table if not exists diagnosis_events (
    id              uuid        primary key default gen_random_uuid(),
    session_id      text        not null,
    event_type      text        not null
                                check (event_type in ('welcome_start', 'diagnosis_complete', 'match_view', 'provider_contact')),
    provider_id     text,
    diagnosis_id    text,
    created_at      timestamptz not null default now(),
    user_agent      text,
    ip_hash         text
);

create index if not exists diagnosis_events_created_at_idx on diagnosis_events (created_at desc);
create index if not exists diagnosis_events_session_id_idx  on diagnosis_events (session_id);

-- ── 3. Contact messages ───────────────────────────────────────────────────────

create table if not exists contact_messages (
    id          uuid        primary key default gen_random_uuid(),
    created_at  timestamptz not null    default now(),
    name        text        not null,
    email       text        not null,
    subject     text,
    message     text        not null,
    status      text        not null    default 'unread'
                            check (status in ('unread', 'read', 'replied')),
    replied_at  timestamptz,
    reply_text  text
);

create index if not exists contact_messages_created_at_idx on contact_messages (created_at desc);
