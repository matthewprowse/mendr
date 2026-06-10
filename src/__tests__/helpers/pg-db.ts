/**
 * Real-Postgres test adapter over a `pg` connection — for running the DB suite
 * against an actual Supabase branch (or any Postgres) via SUPABASE_DB_URL.
 *
 * Reuses the EXACT schema SQL and migrations that the PGlite harness uses, so
 * the only thing this adds over PGlite is a real server (real auth.uid(), real
 * roles, real Postgres). On a Supabase branch the roles + auth schema already
 * exist, so we apply only the base-table schema + the Pro migrations + grants.
 */
import { Client } from 'pg';
import { BASE_SCHEMA_SQL, PRO_MIGRATIONS, POST_GRANTS, readMigration } from './pglite-db';

export interface PgTestDb {
    asUser<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
    asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    asService<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    raw<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    close(): Promise<void>;
}

/** Connect, apply the schema (idempotently), and return role-aware query helpers. */
export async function createPgTestDb(connectionString: string): Promise<PgTestDb> {
    const client = new Client({ connectionString });
    await client.connect();

    // Apply base schema + Pro migrations + grants. Tolerate "already exists" so a
    // re-run against the same branch is a no-op rather than a hard failure.
    const blocks = [BASE_SCHEMA_SQL, ...PRO_MIGRATIONS.map(readMigration), POST_GRANTS];
    for (const sql of blocks) {
        try {
            await client.query(sql);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!/already exists/i.test(msg)) throw err;
        }
    }

    async function run<T>(setup: string, sql: string, params?: unknown[]): Promise<T[]> {
        if (setup) await client.query(setup);
        try {
            const res = await client.query(sql, params as unknown[] | undefined);
            return res.rows as T[];
        } finally {
            if (setup) await client.query('RESET ROLE');
        }
    }

    const claims = (sub: string | null, role: string) =>
        sub
            ? `SELECT set_config('request.jwt.claims', '{"sub":"${sub}","role":"${role}"}', false); SET ROLE ${role};`
            : `SELECT set_config('request.jwt.claims', '{"role":"${role}"}', false); SET ROLE ${role};`;

    return {
        asUser: (userId, sql, params) => run(claims(userId, 'authenticated'), sql, params),
        asAnon: (sql, params) => run(claims(null, 'anon'), sql, params),
        asService: (sql, params) => run('SET ROLE service_role;', sql, params),
        raw: (sql, params) => run('', sql, params),
        close: () => client.end(),
    };
}
