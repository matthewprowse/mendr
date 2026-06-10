/**
 * Real-Postgres test harness via PGlite (embedded WASM Postgres — no Docker).
 *
 * Loads the project's actual Pro-portal migrations on top of a minimal stub of
 * the pre-existing base tables (providers, profiles, provider_contact_events),
 * plus Supabase-compatible `auth` shims and the anon/authenticated/service_role
 * roles. This lets us test the *deployed* RLS policies, the gap-free invoice
 * sequence, CHECK/unique constraints, and FK cascades against a genuine Postgres
 * engine — the things the JS Supabase mock fundamentally cannot prove.
 *
 * Fidelity notes:
 *  - `auth.uid()` / `auth.role()` / `auth.jwt()` mirror Supabase's real
 *    definitions (read `request.jwt.claims` GUC).
 *  - `service_role` is granted BYPASSRLS, matching Supabase, so service-role
 *    code paths see everything (the Pro portal writes via the service role).
 *  - Base tables are stubbed to the columns the Pro migrations reference; the
 *    migrations themselves add `providers.merged_into` and `providers.plan`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Consolidated pro-portal DDL derived from the original incremental migrations.
// A single file keeps the harness independent of individual migration timestamps.
export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations_pre_baseline');

/** Read a migration file's SQL by filename. */
export function readMigration(file: string): string {
    return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

/** Pro-portal migrations, in apply order, layered on the base schema. */
export const PRO_MIGRATIONS = [
    'pro_portal.sql',
];

export const ROLES_AUTH_SQL = `
-- Supabase roles.
CREATE ROLE anon NOINHERIT;
CREATE ROLE authenticated NOINHERIT;
CREATE ROLE service_role NOINHERIT BYPASSRLS;

-- Supabase auth schema + the helpers RLS policies call.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb)
$$;
`;

// Base-table schema only (no roles/auth) — reusable against a real Supabase
// branch, where the roles and auth schema already exist.
export const BASE_SCHEMA_SQL = `
-- Base tables that pre-date the Pro migrations in prod (their earlier creation
-- migrations are not in the repo). Reproduced from the LIVE production schema
-- (columns, types, NOT NULL, FK on-delete actions) so the RLS/cascade tests run
-- against the real shape, not an invented one. Two harness-only DEFAULTs are
-- marked below (providers.source / providers.name are NOT NULL with no prod
-- default — defaulted here so seeds stay terse; nothing under test depends on
-- them). 'plan' and 'merged_into' are intentionally omitted: the Pro migrations
-- add them, with their real CHECK/FK, exactly as in prod.
CREATE TABLE public.diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  title text DEFAULT 'New Diagnosis',
  customer_address text,
  primary_trade text,
  diagnosis jsonb,
  is_direct_match boolean NOT NULL DEFAULT false,
  image_refinement_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  clarification_round integer NOT NULL DEFAULT 0,
  refinement_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  surname text,
  username text,
  avatar_url text,
  is_admin boolean NOT NULL DEFAULT false,
  profile_type text NOT NULL DEFAULT 'customer',
  phone text,
  phone_verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'test',            -- harness default (prod: none)
  google_place_id text,
  name text NOT NULL DEFAULT 'Test Provider',     -- harness default (prod: none)
  address text,
  rating numeric,
  rating_count integer,
  phone text,
  website text,
  latitude double precision,
  longitude double precision,
  specialisations text[] NOT NULL DEFAULT '{}',
  service_areas text[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  notify_realtime boolean NOT NULL DEFAULT true,
  service_area_center_lat numeric,
  service_area_center_lng numeric,
  service_area_radius_km integer NOT NULL DEFAULT 15,
  mendr_rating numeric,
  mendr_rating_count integer NOT NULL DEFAULT 0,
  insurance_cover text,
  typical_response_time text,
  pricing_model text,
  callout_fee numeric,
  preferred_contact_channel text,
  field_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz,
  -- NB: prod has NO foreign key here, so deleting an auth user does NOT null it.
  claimed_by_user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.provider_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.diagnoses(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',                  -- harness default
  dedupe_key text NOT NULL DEFAULT gen_random_uuid()::text,  -- harness default
  homeowner_whatsapp text,
  diagnosis_trade text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

// Grants run AFTER migrations so they cover the newly-created Pro tables.
// In Supabase, anon/authenticated hold broad table privileges and RLS is the
// actual gate; we replicate that so a denied read returns 0 rows, not a
// "permission denied" error.
export const POST_GRANTS = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
-- Deliberately NOT granting EXECUTE on all functions: function-level grants are
-- left as the migrations set them (e.g. get_user_id_by_email REVOKEs anon/auth),
-- so we don't paper over a deliberate SECURITY DEFINER lockdown.
`;

export interface TestDb {
    db: PGlite;
    /** Run a query as an authenticated user (RLS applies, auth.uid() = userId). */
    asUser<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
    /** Run a query as the anon role (RLS applies, no jwt sub). */
    asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Run a query as the service role (BYPASSRLS — mirrors server-side writes). */
    asService<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Run a query as the superuser owner (setup/seed; bypasses RLS). */
    raw<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Wipe all Pro + stub tables between tests (faster than reloading migrations). */
    truncateAll(): Promise<void>;
    close(): Promise<void>;
}

const ALL_TABLES =
    'auth.users, public.profiles, public.diagnoses, public.providers, public.provider_contact_events, ' +
    'public.provider_claims, public.provider_customers, public.jobs, public.quotes, public.quote_items, ' +
    'public.invoices, public.invoice_items, public.credit_notes, public.provider_branding, ' +
    'public.provider_members, public.lead_states, public.provider_document_counters, ' +
    'public.lead_contact_consents';

/** Spin up a fresh in-memory Postgres with the Pro schema + RLS loaded. */
export async function createTestDb(): Promise<TestDb> {
    const db = await PGlite.create();
    await db.exec(ROLES_AUTH_SQL);
    await db.exec(BASE_SCHEMA_SQL);
    for (const file of PRO_MIGRATIONS) {
        await db.exec(readMigration(file));
    }
    await db.exec(POST_GRANTS);

    async function run<T>(roleSetup: string, sql: string, params?: unknown[]): Promise<T[]> {
        if (roleSetup) await db.exec(roleSetup);
        try {
            const res = await db.query<T>(sql, params);
            return res.rows;
        } finally {
            if (roleSetup) await db.exec('RESET ROLE;');
        }
    }

    return {
        db,
        asUser: <T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]) =>
            run<T>(
                `SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false); SET ROLE authenticated;`,
                sql,
                params,
            ),
        asAnon: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
            run<T>(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false); SET ROLE anon;`, sql, params),
        asService: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
            run<T>('SET ROLE service_role;', sql, params),
        raw: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => run<T>('', sql, params),
        truncateAll: async () => {
            await db.exec(`TRUNCATE ${ALL_TABLES} RESTART IDENTITY CASCADE;`);
        },
        close: () => db.close(),
    };
}
