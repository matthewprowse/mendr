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

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Pro-portal migrations, in apply order, layered on the stub base schema. */
const PRO_MIGRATIONS = [
    '20260604160000_lead_states_and_provider_merge.sql',
    '20260605123139_provider_claims.sql',
    '20260605152115_provider_customers.sql',
    '20260605160926_jobs.sql',
    '20260605161456_quotes.sql',
    '20260605162340_invoices.sql',
    '20260605163225_provider_members.sql',
    '20260605163239_provider_members_fix_rls_recursion.sql',
    '20260605163403_get_user_id_by_email_rpc.sql',
    '20260605170401_providers_plan_tier.sql',
];

const PREAMBLE = `
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

-- Stub of pre-existing base tables (created before the Pro migrations in prod).
-- Only the columns the Pro migrations reference via FK or policy.
CREATE TABLE public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.provider_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

// Grants run AFTER migrations so they cover the newly-created Pro tables.
// In Supabase, anon/authenticated hold broad table privileges and RLS is the
// actual gate; we replicate that so a denied read returns 0 rows, not a
// "permission denied" error.
const POST_GRANTS = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
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
    'auth.users, public.providers, public.provider_contact_events, public.provider_claims, ' +
    'public.provider_customers, public.jobs, public.quotes, public.quote_items, public.invoices, ' +
    'public.invoice_items, public.credit_notes, public.provider_branding, public.provider_members, ' +
    'public.lead_states, public.provider_document_counters';

/** Spin up a fresh in-memory Postgres with the Pro schema + RLS loaded. */
export async function createTestDb(): Promise<TestDb> {
    const db = await PGlite.create();
    await db.exec(PREAMBLE);
    for (const file of PRO_MIGRATIONS) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        await db.exec(sql);
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
