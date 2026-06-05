/**
 * Foreign-key delete behaviour (CASCADE vs SET NULL) on the Pro tables, against
 * real Postgres. Proves a provider/customer/quote/user deletion cleans up — or
 * preserves — the right rows, which is exactly what a JS mock cannot verify.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

const USER_A = '11111111-1111-4111-8111-111111111111';
const PROV_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const CUST = 'cccccccc-1111-4111-8111-111111111111';
const QUOTE = 'dddddddd-1111-4111-8111-111111111111';
const INVOICE = 'eeeeeeee-1111-4111-8111-111111111111';
const EVENT = '77777777-aaaa-4aaa-8aaa-777777777777';
const JOB = 'ffffffff-1111-4111-8111-111111111111';

let t: TestDb;
beforeAll(async () => {
    t = await createTestDb();
});
beforeEach(async () => {
    await t.truncateAll();
    await t.raw(`INSERT INTO auth.users (id, email) VALUES ('${USER_A}','a@x.co')`);
    await t.raw(`INSERT INTO public.providers (id, claimed_by_user_id) VALUES ('${PROV_A}','${USER_A}')`);
});
afterAll(async () => {
    await t.close();
});

async function count(table: string, where = ''): Promise<number> {
    const rows = await t.raw<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table} ${where}`);
    return Number(rows[0].n);
}

describe('FK cascades on provider delete', () => {
    it('cascades all owned Pro rows when the provider is deleted', async () => {
        await t.raw(`INSERT INTO public.provider_customers (id, provider_id) VALUES ('${CUST}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.quotes (id, provider_id) VALUES ('${QUOTE}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.invoices (id, provider_id) VALUES ('${INVOICE}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.jobs (id, provider_id) VALUES ('${JOB}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.provider_members (provider_id, role) VALUES ('${PROV_A}','owner')`);
        await t.raw(`INSERT INTO public.provider_branding (provider_id) VALUES ('${PROV_A}')`);
        await t.raw(`INSERT INTO public.provider_document_counters (provider_id, invoice_seq) VALUES ('${PROV_A}', 3)`);

        await t.raw(`DELETE FROM public.providers WHERE id = '${PROV_A}'`);

        expect(await count('provider_customers')).toBe(0);
        expect(await count('quotes')).toBe(0);
        expect(await count('invoices')).toBe(0);
        expect(await count('jobs')).toBe(0);
        expect(await count('provider_members')).toBe(0);
        expect(await count('provider_branding')).toBe(0);
        expect(await count('provider_document_counters')).toBe(0);
    });
});

describe('FK cascades on child delete', () => {
    it('deletes invoice_items and credit_notes when the invoice is deleted', async () => {
        await t.raw(`INSERT INTO public.invoices (id, provider_id) VALUES ('${INVOICE}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.invoice_items (invoice_id, description) VALUES ('${INVOICE}','x')`);
        await t.raw(`INSERT INTO public.credit_notes (invoice_id, amount) VALUES ('${INVOICE}', 5)`);
        await t.raw(`DELETE FROM public.invoices WHERE id = '${INVOICE}'`);
        expect(await count('invoice_items')).toBe(0);
        expect(await count('credit_notes')).toBe(0);
    });

    it('cascades lead_states when the contact event is deleted', async () => {
        await t.raw(`INSERT INTO public.provider_contact_events (id, provider_id) VALUES ('${EVENT}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.lead_states (contact_event_id, status) VALUES ('${EVENT}','new')`);
        await t.raw(`DELETE FROM public.provider_contact_events WHERE id = '${EVENT}'`);
        expect(await count('lead_states')).toBe(0);
    });
});

describe('FK SET NULL — preserve the record, drop the link', () => {
    it('nulls invoice.customer_id / quote.customer_id / job.customer_id when a customer is deleted', async () => {
        await t.raw(`INSERT INTO public.provider_customers (id, provider_id) VALUES ('${CUST}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.invoices (id, provider_id, customer_id) VALUES ('${INVOICE}','${PROV_A}','${CUST}')`);
        await t.raw(`INSERT INTO public.quotes (id, provider_id, customer_id) VALUES ('${QUOTE}','${PROV_A}','${CUST}')`);
        await t.raw(`INSERT INTO public.jobs (id, provider_id, customer_id) VALUES ('${JOB}','${PROV_A}','${CUST}')`);

        await t.raw(`DELETE FROM public.provider_customers WHERE id = '${CUST}'`);

        expect(await count('invoices', `WHERE customer_id IS NULL AND id = '${INVOICE}'`)).toBe(1);
        expect(await count('quotes', `WHERE customer_id IS NULL AND id = '${QUOTE}'`)).toBe(1);
        expect(await count('jobs', `WHERE customer_id IS NULL AND id = '${JOB}'`)).toBe(1);
    });

    it('nulls invoice.quote_id when the quote is deleted', async () => {
        await t.raw(`INSERT INTO public.quotes (id, provider_id) VALUES ('${QUOTE}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.invoices (id, provider_id, quote_id) VALUES ('${INVOICE}','${PROV_A}','${QUOTE}')`);
        await t.raw(`DELETE FROM public.quotes WHERE id = '${QUOTE}'`);
        expect(await count('invoices', `WHERE quote_id IS NULL AND id = '${INVOICE}'`)).toBe(1);
    });

    it('nulls job.contact_event_id when the contact event is deleted', async () => {
        await t.raw(`INSERT INTO public.provider_contact_events (id, provider_id) VALUES ('${EVENT}','${PROV_A}')`);
        await t.raw(`INSERT INTO public.jobs (id, provider_id, contact_event_id) VALUES ('${JOB}','${PROV_A}','${EVENT}')`);
        await t.raw(`DELETE FROM public.provider_contact_events WHERE id = '${EVENT}'`);
        expect(await count('jobs', `WHERE contact_event_id IS NULL AND id = '${JOB}'`)).toBe(1);
    });

    it('nulls provider.claimed_by_user_id and member links when the user is deleted', async () => {
        await t.raw(`INSERT INTO public.provider_members (provider_id, user_id, role) VALUES ('${PROV_A}','${USER_A}','owner')`);
        await t.raw(`DELETE FROM auth.users WHERE id = '${USER_A}'`);
        expect(await count('providers', `WHERE claimed_by_user_id IS NULL AND id = '${PROV_A}'`)).toBe(1);
        expect(await count('provider_members', `WHERE user_id IS NULL`)).toBe(1);
    });
});
