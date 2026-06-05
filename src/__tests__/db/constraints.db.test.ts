/**
 * CHECK constraints and unique (partial) indexes on the Pro tables, against
 * real Postgres. These guard data integrity the app assumes but the JS mock
 * never enforces.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROV_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROV_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const EVENT = '77777777-aaaa-4aaa-8aaa-777777777777';

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

describe('CHECK constraints', () => {
    it('rejects an invalid invoice status', async () => {
        await expect(
            t.raw(`INSERT INTO public.invoices (provider_id, status) VALUES ('${PROV_A}','frozen')`),
        ).rejects.toThrow();
    });

    it('accepts the valid invoice statuses', async () => {
        for (const s of ['draft', 'sent', 'partial', 'paid', 'overdue']) {
            await t.raw(`INSERT INTO public.invoices (provider_id, status) VALUES ('${PROV_A}','${s}')`);
        }
        const rows = await t.raw<{ n: number }>(`SELECT count(*)::int AS n FROM public.invoices`);
        expect(Number(rows[0].n)).toBe(5);
    });

    it('rejects an invalid quote status', async () => {
        await expect(
            t.raw(`INSERT INTO public.quotes (provider_id, status) VALUES ('${PROV_A}','negotiating')`),
        ).rejects.toThrow();
    });

    it('rejects an invalid job status', async () => {
        await expect(
            t.raw(`INSERT INTO public.jobs (provider_id, status) VALUES ('${PROV_A}','paused')`),
        ).rejects.toThrow();
    });

    it('rejects an invalid lead status', async () => {
        await t.raw(`INSERT INTO public.provider_contact_events (id, provider_id) VALUES ('${EVENT}','${PROV_A}')`);
        await expect(
            t.raw(`INSERT INTO public.lead_states (contact_event_id, status) VALUES ('${EVENT}','cold')`),
        ).rejects.toThrow();
    });

    it('rejects an invalid member role and status', async () => {
        await expect(
            t.raw(`INSERT INTO public.provider_members (provider_id, role) VALUES ('${PROV_A}','superadmin')`),
        ).rejects.toThrow();
        await expect(
            t.raw(`INSERT INTO public.provider_members (provider_id, status) VALUES ('${PROV_A}','banned')`),
        ).rejects.toThrow();
    });

    it('rejects an invalid claim status', async () => {
        await expect(
            t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_A}','${USER_A}','maybe')`),
        ).rejects.toThrow();
    });

    it('rejects an invalid provider plan', async () => {
        await expect(
            t.raw(`UPDATE public.providers SET plan = 'enterprise' WHERE id = '${PROV_A}'`),
        ).rejects.toThrow();
    });
});

describe('unique (partial) indexes', () => {
    it('allows only one pending claim per provider', async () => {
        await t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_A}','${USER_A}','pending')`);
        await expect(
            t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_A}','${USER_B}','pending')`),
        ).rejects.toThrow();
        // A rejected claim on the same provider is fine (partial index is WHERE status='pending').
        await t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_A}','${USER_B}','rejected')`);
    });

    it('allows only one pending claim per user', async () => {
        await t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_A}','${USER_A}','pending')`);
        await expect(
            t.raw(`INSERT INTO public.provider_claims (provider_id, user_id, status) VALUES ('${PROV_B}','${USER_A}','pending')`),
        ).rejects.toThrow();
    });

    it('allows only one job per originating contact event', async () => {
        await t.raw(`INSERT INTO public.provider_contact_events (id, provider_id) VALUES ('${EVENT}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.jobs (provider_id, contact_event_id) VALUES ('${PROV_A}','${EVENT}')`);
        await expect(
            t.raw(`INSERT INTO public.jobs (provider_id, contact_event_id) VALUES ('${PROV_A}','${EVENT}')`),
        ).rejects.toThrow();
    });

    it('allows only one membership per (provider, user)', async () => {
        await t.raw(`INSERT INTO public.provider_members (provider_id, user_id, role) VALUES ('${PROV_A}','${USER_B}','member')`);
        await expect(
            t.raw(`INSERT INTO public.provider_members (provider_id, user_id, role) VALUES ('${PROV_A}','${USER_B}','admin')`),
        ).rejects.toThrow();
    });

    it('dedupes provider_customers by (provider, homeowner_user_id) but allows many manual (null) rows', async () => {
        await t.raw(`INSERT INTO public.provider_customers (provider_id, homeowner_user_id) VALUES ('${PROV_A}','${USER_B}')`);
        await expect(
            t.raw(`INSERT INTO public.provider_customers (provider_id, homeowner_user_id) VALUES ('${PROV_A}','${USER_B}')`),
        ).rejects.toThrow();
        // Two manual customers (null homeowner) are allowed for the same provider.
        await t.raw(`INSERT INTO public.provider_customers (provider_id, name) VALUES ('${PROV_A}','Walk-in 1')`);
        await t.raw(`INSERT INTO public.provider_customers (provider_id, name) VALUES ('${PROV_A}','Walk-in 2')`);
    });
});
