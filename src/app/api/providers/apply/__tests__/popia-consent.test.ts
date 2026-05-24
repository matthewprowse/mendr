/**
 * POPIA consent enforcement on the contractor application endpoint.
 *
 * The provider apply route must:
 *  1. Reject submissions without explicit `popiaConsent: true` with HTTP 400.
 *  2. Accept submissions when consent is provided.
 *  3. Persist `popia_consent_at` (timestamp) on the inserted application row.
 *
 * These tests mock the Supabase admin client so we can introspect the
 * insert payload — the route under test passes a fixed object to
 * `.from('provider_applications').insert(...)`.
 *
 * Lawyer-review note: the timestamp is generated server-side at the moment
 * of insert. We do not trust a client-supplied timestamp for the consent
 * audit trail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

type InsertCapture = { lastPayload: Record<string, unknown> | null };
const insertCapture: InsertCapture = { lastPayload: null };

// Minimal Supabase admin mock that records the insert payload so we can
// assert `popia_consent_at` was written.
function buildAdminClient(insertResult: { data: { id: string } | null; error: { message: string } | null }) {
    return {
        from: vi.fn(() => {
            const builder: Record<string, unknown> = {};
            const chain = (fn: (...args: unknown[]) => unknown) => {
                Object.assign(builder, { then: undefined });
                return Object.assign(builder, { ...builder, ...{} }), fn;
            };

            const select = vi.fn(() => ({
                single: vi.fn(async () => insertResult),
            }));
            const insert = vi.fn((payload: Record<string, unknown>) => {
                insertCapture.lastPayload = payload;
                return {
                    select,
                };
            });
            const update = vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            }));

            // Awaitable for pipeline/email patch updates that don't read result.
            const thenable = { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) };

            void chain; // appease unused-var
            return {
                insert,
                update,
                ...thenable,
            };
        }),
        auth: {
            getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        },
    };
}

let adminClient: ReturnType<typeof buildAdminClient>;
let serverClient: { auth: { getUser: ReturnType<typeof vi.fn> } };

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));
vi.mock('@/lib/resend-mail', () => ({
    sendScandioEmail: vi.fn(async () => ({ ok: true })),
    confirmationEmail: vi.fn(() => ({ text: 'text', html: '<html />' })),
}));
vi.mock('@/lib/site-url', () => ({ getAppOrigin: () => 'https://mendr.test' }));

const validBody = {
    contractorType: 'individual',
    willingnessToPayBand: '350_700',
    businessName: 'Pro Co',
    contactPerson: 'Ada Lovelace',
    emailAddress: 'ada@example.com',
    address: '123 Main St, Cape Town',
    serviceAreas: 'Cape Town',
    phone: '+27821234567',
    trade: 'Plumbing',
    specialisations: 'burst pipes',
    foundedYear: '2018',
};

beforeEach(() => {
    vi.clearAllMocks();
    insertCapture.lastPayload = null;
    serverClient = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } };
    adminClient = buildAdminClient({ data: { id: 'app-1' }, error: null });
    delete process.env.CRON_SECRET;
});

describe('POST /api/providers/apply — POPIA consent enforcement', () => {
    it('returns 400 when popiaConsent is missing', async () => {
        const { POST } = await import('../route');
        const res = await POST(makeRequest({ method: 'POST', body: { ...validBody } }));
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error?: string };
        expect(json.error).toMatch(/POPIA|Privacy Policy/i);
    });

    it('returns 400 when popiaConsent is explicitly false', async () => {
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, popiaConsent: false } }),
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error?: string };
        expect(json.error).toMatch(/POPIA|Privacy Policy/i);
    });

    it('returns 400 when popiaConsent is a truthy non-boolean (e.g. "yes")', async () => {
        // Defensive: strict boolean check guards against client-side coercion bugs.
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, popiaConsent: 'yes' } }),
        );
        expect(res.status).toBe(400);
    });

    it('accepts the submission when popiaConsent is true', async () => {
        const { POST } = await import('../route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, popiaConsent: true } }),
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { ok?: boolean };
        expect(json.ok).toBe(true);
    });

    it('writes popia_consent_at as an ISO timestamp on accepted submissions', async () => {
        const { POST } = await import('../route');
        const before = Date.now();
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, popiaConsent: true } }),
        );
        const after = Date.now();
        expect(res.status).toBe(200);

        expect(insertCapture.lastPayload).not.toBeNull();
        const consentAtRaw = insertCapture.lastPayload?.popia_consent_at;
        expect(typeof consentAtRaw).toBe('string');
        const consentAt = Date.parse(consentAtRaw as string);
        expect(Number.isFinite(consentAt)).toBe(true);
        // Server-generated timestamp must fall inside the test window.
        expect(consentAt).toBeGreaterThanOrEqual(before);
        expect(consentAt).toBeLessThanOrEqual(after + 1000);
    });
});
