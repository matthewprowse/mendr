/**
 * Contract tests for POST /api/contact/contractor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const notifyContractorOfLeadMock = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock('@/lib/providers/notify-contractor-of-lead', () => ({
    notifyContractorOfLead: (...args: unknown[]) => notifyContractorOfLeadMock(...args),
}));

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * @param insertedRows what the `provider_contact_events` upsert+select resolves
 *   to. A non-empty array represents a genuinely new event; an empty array (or
 *   null) represents a duplicate tap that `ignoreDuplicates` skipped.
 */
function freshSupabase(
    providerExists = true,
    diagnosisTrade: string | null = 'Plumbing',
    insertedRows: Array<{ id: string }> | null = [{ id: 'evt-1' }],
) {
    return mockSupabaseClient({
        tables: {
            providers: (_t, op) => {
                if (op === 'select') {
                    return providerExists
                        ? { data: { id: VALID_UUID }, error: null }
                        : { data: null, error: null };
                }
                return { data: null, error: null };
            },
            diagnoses: { data: { diagnosis: { trade: diagnosisTrade } }, error: null },
            provider_contact_events: { data: insertedRows, error: null },
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = freshSupabase();
});

describe('POST /api/contact/contractor — validation', () => {
    it('returns 400 when providerId is not a UUID', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: 'not-a-uuid', diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/providerId/);
    });

    it('returns 400 when diagnosisId is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { providerId: VALID_UUID } }),
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/contact/contractor — happy path', () => {
    it('returns { ok: true } on valid call', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    providerId: VALID_UUID,
                    diagnosisId: VALID_UUID_2,
                    channel: 'whatsapp',
                },
            }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('defaults channel to whatsapp when not supplied', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: VALID_UUID, diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(200);
    });
});

describe('POST /api/contact/contractor — edge cases', () => {
    it('returns 404 when provider does not exist or is inactive', async () => {
        supabase = freshSupabase(false);
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: VALID_UUID, diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(404);
    });

    it('still returns { ok: true } when the lead notification rejects', async () => {
        notifyContractorOfLeadMock.mockRejectedValueOnce(new Error('smtp down'));
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: VALID_UUID, diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: VALID_UUID, diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(429);
    });
});

describe('POST /api/contact/contractor — realtime lead notification wiring', () => {
    it('fires the lead notification for a genuinely new contact event', async () => {
        supabase = freshSupabase(true, 'Plumbing', [{ id: 'evt-1' }]);
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    providerId: VALID_UUID,
                    diagnosisId: VALID_UUID_2,
                    homeownerWhatsapp: '+27821234567',
                },
            }),
        );
        expect(res.status).toBe(200);
        // Fire-and-forget — allow the microtask queue to flush.
        await Promise.resolve();
        expect(notifyContractorOfLeadMock).toHaveBeenCalledTimes(1);
        expect(notifyContractorOfLeadMock).toHaveBeenCalledWith({
            contractorId: VALID_UUID,
            diagnosisId: VALID_UUID_2,
            homeownerWhatsapp: '+27821234567',
        });
    });

    it('does NOT fire the notification for a duplicate tap (empty insert result)', async () => {
        supabase = freshSupabase(true, 'Plumbing', []);
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { providerId: VALID_UUID, diagnosisId: VALID_UUID_2 },
            }),
        );
        expect(res.status).toBe(200);
        await Promise.resolve();
        expect(notifyContractorOfLeadMock).not.toHaveBeenCalled();
    });
});
