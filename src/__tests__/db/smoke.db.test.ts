import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

let t: TestDb;

beforeAll(async () => {
    t = await createTestDb();
});
afterAll(async () => {
    await t.close();
});

describe('PGlite harness smoke test', () => {
    it('loaded the Pro tables', async () => {
        const rows = await t.raw<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
        );
        const names = rows.map((r) => r.table_name);
        expect(names).toEqual(
            expect.arrayContaining(['invoices', 'quotes', 'jobs', 'provider_customers', 'provider_members', 'provider_claims', 'lead_states', 'provider_document_counters']),
        );
    });

    it('enforces invoice RLS: a Pro sees only their own provider rows', async () => {
        await t.raw(`INSERT INTO auth.users (id, email) VALUES
            ('11111111-1111-4111-8111-111111111111','a@x.co'),
            ('22222222-2222-4222-8222-222222222222','b@x.co')`);
        await t.raw(`INSERT INTO public.providers (id, claimed_by_user_id, name) VALUES
            ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Acme'),
            ('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','Beta')`);
        await t.raw(`INSERT INTO public.invoices (provider_id) VALUES
            ('aaaaaaaa-1111-4111-8111-111111111111'),
            ('bbbbbbbb-2222-4222-8222-222222222222')`);

        const aRows = await t.asUser('11111111-1111-4111-8111-111111111111', 'SELECT provider_id FROM public.invoices');
        expect(aRows).toHaveLength(1);

        const anon = await t.asAnon('SELECT provider_id FROM public.invoices');
        expect(anon).toHaveLength(0);

        const svc = await t.asService('SELECT provider_id FROM public.invoices');
        expect(svc).toHaveLength(2);
    });
});
