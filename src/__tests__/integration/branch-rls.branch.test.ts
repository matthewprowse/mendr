/**
 * RLS isolation + invoice numbering against a REAL Postgres (a Supabase branch),
 * not the in-process PGlite engine. Proves the deployed-style policies hold with
 * the real auth.uid() and real roles.
 *
 * Gated on SUPABASE_DB_URL — skipped entirely when unset, so it never runs (or
 * fails) in the normal suite. Run with:
 *   SUPABASE_DB_URL='postgresql://postgres:[PWD]@db.<branch-ref>.supabase.co:5432/postgres' pnpm test:integration
 *
 * The seeds use arbitrary UUIDs for claimed_by_user_id (production has no FK
 * there), so no auth.users rows are required for these checks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPgTestDb, type PgTestDb } from '@/__tests__/helpers/pg-db';

const URL = process.env.SUPABASE_DB_URL;
const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';
const PA = 'aaaaaaaa-1111-4111-8111-111111111111';
const PB = 'bbbbbbbb-2222-4222-8222-222222222222';

describe.skipIf(!URL)('branch RLS isolation (real Postgres)', () => {
    let t: PgTestDb;

    beforeAll(async () => {
        t = await createPgTestDb(URL!);
        // Clean slate for these fixed ids, then seed two tenants.
        await t.raw(`DELETE FROM public.providers WHERE id IN ('${PA}','${PB}')`);
        await t.raw(`INSERT INTO public.providers (id, claimed_by_user_id, name) VALUES
            ('${PA}','${UA}','Acme'), ('${PB}','${UB}','Beta')`);
        await t.raw(`INSERT INTO public.invoices (provider_id) VALUES ('${PA}'), ('${PB}')`);
    });

    afterAll(async () => {
        if (!t) return;
        await t.raw(`DELETE FROM public.providers WHERE id IN ('${PA}','${PB}')`); // cascades invoices
        await t.close();
    });

    it('a Pro reads only their own invoices', async () => {
        expect(await t.asUser(UA, `SELECT id FROM public.invoices WHERE provider_id IN ('${PA}','${PB}')`)).toHaveLength(1);
        expect(await t.asUser(UB, `SELECT id FROM public.invoices WHERE provider_id IN ('${PA}','${PB}')`)).toHaveLength(1);
    });

    it('anon sees nothing; service role sees both', async () => {
        expect(await t.asAnon(`SELECT id FROM public.invoices WHERE provider_id IN ('${PA}','${PB}')`)).toHaveLength(0);
        expect(await t.asService(`SELECT id FROM public.invoices WHERE provider_id IN ('${PA}','${PB}')`)).toHaveLength(2);
    });

    it('WITH CHECK blocks a cross-tenant insert', async () => {
        await expect(
            t.asUser(UA, `INSERT INTO public.invoices (provider_id) VALUES ('${PB}')`),
        ).rejects.toThrow();
    });

    it('next_invoice_seq is gap-free per provider', async () => {
        const seq = async () =>
            Number((await t.raw<{ next_invoice_seq: number }>(`SELECT public.next_invoice_seq('${PA}')`))[0].next_invoice_seq);
        const first = await seq();
        expect(await seq()).toBe(first + 1);
        expect(await seq()).toBe(first + 2);
    });
});
