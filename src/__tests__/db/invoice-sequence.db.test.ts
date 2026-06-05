/**
 * next_invoice_seq() — gap-free, per-provider invoice numbering, against the
 * real plpgsql function in Postgres. This is money-integrity logic the JS mock
 * cannot exercise.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROV_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROV_B = 'bbbbbbbb-2222-4222-8222-222222222222';

let t: TestDb;
beforeAll(async () => {
    t = await createTestDb();
});
beforeEach(async () => {
    await t.truncateAll();
    await t.raw(`INSERT INTO auth.users (id, email) VALUES ('${USER_A}','a@x.co'), ('${USER_B}','b@x.co')`);
    await t.raw(`INSERT INTO public.providers (id, claimed_by_user_id) VALUES ('${PROV_A}','${USER_A}'), ('${PROV_B}','${USER_B}')`);
});
afterAll(async () => {
    await t.close();
});

async function nextSeq(provider: string): Promise<number> {
    const rows = await t.raw<{ next_invoice_seq: number }>(`SELECT public.next_invoice_seq('${provider}')`);
    return Number(rows[0].next_invoice_seq);
}

describe('next_invoice_seq', () => {
    it('returns 1, 2, 3 … gap-free for a provider', async () => {
        expect(await nextSeq(PROV_A)).toBe(1);
        expect(await nextSeq(PROV_A)).toBe(2);
        expect(await nextSeq(PROV_A)).toBe(3);
    });

    it('numbers each provider independently', async () => {
        expect(await nextSeq(PROV_A)).toBe(1);
        expect(await nextSeq(PROV_B)).toBe(1);
        expect(await nextSeq(PROV_A)).toBe(2);
        expect(await nextSeq(PROV_B)).toBe(2);
    });

    it('persists the counter in provider_document_counters', async () => {
        await nextSeq(PROV_A);
        await nextSeq(PROV_A);
        const rows = await t.raw<{ invoice_seq: number }>(
            `SELECT invoice_seq FROM public.provider_document_counters WHERE provider_id = '${PROV_A}'`,
        );
        expect(Number(rows[0].invoice_seq)).toBe(2);
    });

    it('has no counter row until first use, then exactly one', async () => {
        const before = await t.raw<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.provider_document_counters WHERE provider_id = '${PROV_A}'`,
        );
        expect(Number(before[0].n)).toBe(0);
        await nextSeq(PROV_A);
        await nextSeq(PROV_A);
        const after = await t.raw<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.provider_document_counters WHERE provider_id = '${PROV_A}'`,
        );
        expect(Number(after[0].n)).toBe(1);
    });

    it('runs a batch of allocations with zero gaps and zero duplicates', async () => {
        const seqs: number[] = [];
        for (let i = 0; i < 25; i++) seqs.push(await nextSeq(PROV_A));
        expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
        expect(new Set(seqs).size).toBe(25);
    });
});
