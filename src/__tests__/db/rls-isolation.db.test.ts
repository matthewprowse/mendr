/**
 * Cross-tenant RLS isolation for every Pro-portal table, run against the real
 * deployed policies in an embedded Postgres (PGlite). This is the coverage the
 * JS Supabase mock cannot give: it proves the *database* refuses to let Pro B
 * read or write Pro A's money and customer data.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROV_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROV_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const DIAG = '99999999-9999-4999-8999-999999999999';

let t: TestDb;

beforeAll(async () => {
    t = await createTestDb();
});
beforeEach(async () => {
    await t.truncateAll();
    await t.raw(`INSERT INTO auth.users (id, email) VALUES ('${USER_A}','a@x.co'), ('${USER_B}','b@x.co')`);
    await t.raw(
        `INSERT INTO public.providers (id, claimed_by_user_id, name) VALUES
         ('${PROV_A}','${USER_A}','Acme'), ('${PROV_B}','${USER_B}','Beta')`,
    );
});
afterAll(async () => {
    await t.close();
});

/**
 * Shared assertion for the standard "claimed_pro_rw" tables: A sees only A's
 * row, B only B's, anon none, service both; and A cannot INSERT into B's tenant.
 */
async function expectTenantIsolation(opts: {
    table: string;
    seedA: string;
    seedB: string;
    crossTenantInsertByA: string;
}) {
    await t.raw(opts.seedA);
    await t.raw(opts.seedB);

    const a = await t.asUser(USER_A, `SELECT * FROM public.${opts.table}`);
    const b = await t.asUser(USER_B, `SELECT * FROM public.${opts.table}`);
    const anon = await t.asAnon(`SELECT * FROM public.${opts.table}`);
    const svc = await t.asService(`SELECT * FROM public.${opts.table}`);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(anon).toHaveLength(0);
    expect(svc).toHaveLength(2);

    // WITH CHECK: A may not create a row inside B's tenant.
    await expect(t.asUser(USER_A, opts.crossTenantInsertByA)).rejects.toThrow();
}

describe('RLS isolation — claimed-Pro read/write tables', () => {
    it('invoices', async () => {
        await expectTenantIsolation({
            table: 'invoices',
            seedA: `INSERT INTO public.invoices (provider_id) VALUES ('${PROV_A}')`,
            seedB: `INSERT INTO public.invoices (provider_id) VALUES ('${PROV_B}')`,
            crossTenantInsertByA: `INSERT INTO public.invoices (provider_id) VALUES ('${PROV_B}')`,
        });
    });

    it('quotes', async () => {
        await expectTenantIsolation({
            table: 'quotes',
            seedA: `INSERT INTO public.quotes (provider_id) VALUES ('${PROV_A}')`,
            seedB: `INSERT INTO public.quotes (provider_id) VALUES ('${PROV_B}')`,
            crossTenantInsertByA: `INSERT INTO public.quotes (provider_id) VALUES ('${PROV_B}')`,
        });
    });

    it('jobs', async () => {
        await expectTenantIsolation({
            table: 'jobs',
            seedA: `INSERT INTO public.jobs (provider_id) VALUES ('${PROV_A}')`,
            seedB: `INSERT INTO public.jobs (provider_id) VALUES ('${PROV_B}')`,
            crossTenantInsertByA: `INSERT INTO public.jobs (provider_id) VALUES ('${PROV_B}')`,
        });
    });

    it('provider_customers', async () => {
        await expectTenantIsolation({
            table: 'provider_customers',
            seedA: `INSERT INTO public.provider_customers (provider_id, name) VALUES ('${PROV_A}','Cust A')`,
            seedB: `INSERT INTO public.provider_customers (provider_id, name) VALUES ('${PROV_B}','Cust B')`,
            crossTenantInsertByA: `INSERT INTO public.provider_customers (provider_id, name) VALUES ('${PROV_B}','X')`,
        });
    });

    it('provider_branding', async () => {
        await expectTenantIsolation({
            table: 'provider_branding',
            seedA: `INSERT INTO public.provider_branding (provider_id) VALUES ('${PROV_A}')`,
            seedB: `INSERT INTO public.provider_branding (provider_id) VALUES ('${PROV_B}')`,
            crossTenantInsertByA: `INSERT INTO public.provider_branding (provider_id) VALUES ('${PROV_B}')`,
        });
    });
});

describe('RLS isolation — child tables (joined through parent)', () => {
    it('invoice_items follow their invoice', async () => {
        await t.raw(`INSERT INTO public.invoices (id, provider_id) VALUES
            ('11111111-aaaa-4aaa-8aaa-111111111111','${PROV_A}'),
            ('22222222-bbbb-4bbb-8bbb-222222222222','${PROV_B}')`);
        await t.raw(`INSERT INTO public.invoice_items (invoice_id, description) VALUES
            ('11111111-aaaa-4aaa-8aaa-111111111111','A item'),
            ('22222222-bbbb-4bbb-8bbb-222222222222','B item')`);
        expect(await t.asUser(USER_A, 'SELECT * FROM public.invoice_items')).toHaveLength(1);
        expect(await t.asUser(USER_B, 'SELECT * FROM public.invoice_items')).toHaveLength(1);
        expect(await t.asAnon('SELECT * FROM public.invoice_items')).toHaveLength(0);
    });

    it('quote_items follow their quote', async () => {
        await t.raw(`INSERT INTO public.quotes (id, provider_id) VALUES
            ('33333333-aaaa-4aaa-8aaa-333333333333','${PROV_A}'),
            ('44444444-bbbb-4bbb-8bbb-444444444444','${PROV_B}')`);
        await t.raw(`INSERT INTO public.quote_items (quote_id, description) VALUES
            ('33333333-aaaa-4aaa-8aaa-333333333333','A line'),
            ('44444444-bbbb-4bbb-8bbb-444444444444','B line')`);
        expect(await t.asUser(USER_A, 'SELECT * FROM public.quote_items')).toHaveLength(1);
        expect(await t.asUser(USER_B, 'SELECT * FROM public.quote_items')).toHaveLength(1);
    });

    it('credit_notes follow their invoice', async () => {
        await t.raw(`INSERT INTO public.invoices (id, provider_id) VALUES
            ('55555555-aaaa-4aaa-8aaa-555555555555','${PROV_A}'),
            ('66666666-bbbb-4bbb-8bbb-666666666666','${PROV_B}')`);
        await t.raw(`INSERT INTO public.credit_notes (invoice_id, amount) VALUES
            ('55555555-aaaa-4aaa-8aaa-555555555555',10),
            ('66666666-bbbb-4bbb-8bbb-666666666666',20)`);
        expect(await t.asUser(USER_A, 'SELECT * FROM public.credit_notes')).toHaveLength(1);
        expect(await t.asUser(USER_B, 'SELECT * FROM public.credit_notes')).toHaveLength(1);
    });

    it('lead_states follow the contact event → provider', async () => {
        await t.raw(`INSERT INTO public.diagnoses (id) VALUES ('${DIAG}')`);
        await t.raw(`INSERT INTO public.provider_contact_events (id, provider_id, conversation_id) VALUES
            ('77777777-aaaa-4aaa-8aaa-777777777777','${PROV_A}','${DIAG}'),
            ('88888888-bbbb-4bbb-8bbb-888888888888','${PROV_B}','${DIAG}')`);
        await t.raw(`INSERT INTO public.lead_states (contact_event_id, status) VALUES
            ('77777777-aaaa-4aaa-8aaa-777777777777','new'),
            ('88888888-bbbb-4bbb-8bbb-888888888888','new')`);
        expect(await t.asUser(USER_A, 'SELECT * FROM public.lead_states')).toHaveLength(1);
        expect(await t.asUser(USER_B, 'SELECT * FROM public.lead_states')).toHaveLength(1);
        expect(await t.asAnon('SELECT * FROM public.lead_states')).toHaveLength(0);
    });
});

describe('RLS isolation — POPIA consent table (homeowner-scoped)', () => {
    it('lead_contact_consents: a homeowner reads only their own consents', async () => {
        await t.raw(`INSERT INTO public.lead_contact_consents (user_id, provider_id) VALUES
            ('${USER_A}','${PROV_A}'),
            ('${USER_B}','${PROV_B}')`);
        const a = await t.asUser(USER_A, 'SELECT * FROM public.lead_contact_consents');
        expect(a).toHaveLength(1);
        expect((a[0] as { user_id: string }).user_id).toBe(USER_A);
        expect(await t.asAnon('SELECT * FROM public.lead_contact_consents')).toHaveLength(0);
        expect(await t.asService('SELECT * FROM public.lead_contact_consents')).toHaveLength(2);
    });

    it('lead_contact_consents: a homeowner can revoke their own but not another’s', async () => {
        await t.raw(`INSERT INTO public.lead_contact_consents (id, user_id, provider_id) VALUES
            ('aaaa1111-1111-4111-8111-111111111111','${USER_A}','${PROV_A}'),
            ('bbbb2222-2222-4222-8222-222222222222','${USER_B}','${PROV_B}')`);
        // A revokes A's own consent — allowed.
        await t.asUser(USER_A, `UPDATE public.lead_contact_consents SET revoked_at = now() WHERE id = 'aaaa1111-1111-4111-8111-111111111111'`);
        const aOwn = await t.asService<{ revoked_at: string | null }>(
            `SELECT revoked_at FROM public.lead_contact_consents WHERE id = 'aaaa1111-1111-4111-8111-111111111111'`,
        );
        expect(aOwn[0].revoked_at).not.toBeNull();
        // A tries to revoke B's consent — RLS filters it out, zero rows affected.
        await t.asUser(USER_A, `UPDATE public.lead_contact_consents SET revoked_at = now() WHERE id = 'bbbb2222-2222-4222-8222-222222222222'`);
        const bOwn = await t.asService<{ revoked_at: string | null }>(
            `SELECT revoked_at FROM public.lead_contact_consents WHERE id = 'bbbb2222-2222-4222-8222-222222222222'`,
        );
        expect(bOwn[0].revoked_at).toBeNull();
    });
});

describe('RLS isolation — owner-scoped read tables', () => {
    it('provider_claims: a user reads only their own claim', async () => {
        await t.raw(`INSERT INTO public.provider_claims (provider_id, user_id) VALUES
            ('${PROV_B}','${USER_A}'),  -- A's pending claim on some provider
            ('${PROV_A}','${USER_B}')`); // B's claim
        const a = await t.asUser(USER_A, 'SELECT * FROM public.provider_claims');
        expect(a).toHaveLength(1);
        expect((a[0] as { user_id: string }).user_id).toBe(USER_A);
        expect(await t.asAnon('SELECT * FROM public.provider_claims')).toHaveLength(0);
    });

    it('provider_members: the owner reads their team; outsiders cannot', async () => {
        // Owner rows are created on claim approval (the migration's one-time
        // backfill ran against the empty stub at load), so seed them here.
        await t.raw(`INSERT INTO public.provider_members (provider_id, user_id, role, status) VALUES
            ('${PROV_A}','${USER_A}','owner','active'),
            ('${PROV_B}','${USER_B}','owner','active')`);
        const aTeam = await t.asUser(USER_A, `SELECT * FROM public.provider_members WHERE provider_id = '${PROV_A}'`);
        expect(aTeam.length).toBeGreaterThanOrEqual(1);
        // A cannot see B's team.
        const aSeesB = await t.asUser(USER_A, `SELECT * FROM public.provider_members WHERE provider_id = '${PROV_B}'`);
        expect(aSeesB).toHaveLength(0);
        expect(await t.asAnon('SELECT * FROM public.provider_members')).toHaveLength(0);
    });
});
