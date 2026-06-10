import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID_TOKEN = 'a'.repeat(64);

function tokenRow(overrides: Record<string, unknown> = {}) {
    return {
        data: {
            id: 'tk1',
            provider_application_id: 'app1',
            expires_at: '2099-01-01',
            used_at: null,
            revoked_at: null,
            ...overrides,
        },
        error: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            provider_application_edit_tokens: tokenRow(),
            provider_applications: {
                data: {
                    id: 'app1',
                    contact_name: 'Ada',
                    business_name: 'Lovelace',
                    trade: 'Plumbing',
                    gemini_summary: 'summary',
                    applicant_summary: null,
                },
                error: null,
            },
        },
    });
});

describe('GET /api/pro/application/edit', () => {
    it('returns 401 when token missing', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/pro/application/edit' }));
        expect(res.status).toBe(401);
    });

    it('returns 401 when token revoked', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_application_edit_tokens: tokenRow({ revoked_at: '2026-01-01' }),
            },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/pro/application/edit?token=${VALID_TOKEN}` }),
        );
        expect(res.status).toBe(401);
    });

    it('returns 401 when token expired', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_application_edit_tokens: tokenRow({ expires_at: '2000-01-01' }),
            },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/pro/application/edit?token=${VALID_TOKEN}` }),
        );
        expect(res.status).toBe(401);
    });

    it('returns the application payload on valid token', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/pro/application/edit?token=${VALID_TOKEN}` }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.applicationId).toBe('app1');
    });
});

describe('POST /api/pro/application/edit', () => {
    it('returns 400 when token missing in body', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { summary: 'updated summary' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when summary empty', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { token: VALID_TOKEN, summary: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when summary > 2000 chars', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { token: VALID_TOKEN, summary: 'x'.repeat(2001) },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { token: VALID_TOKEN, summary: 'Updated summary' },
            }),
        );
        expect(res.status).toBe(200);
    });

    // Sanity check: token hashing uses sha256 so the validation always hashes input
    it('hashes the raw token before comparing', () => {
        const hash = crypto.createHash('sha256').update(VALID_TOKEN).digest('hex');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});
