/**
 * Contract tests for POST /api/contact/contractor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function freshSupabase(providerExists = true, diagnosisTrade: string | null = 'Plumbing') {
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
            provider_contact_events: { data: null, error: null },
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
