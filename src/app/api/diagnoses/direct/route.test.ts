import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/services', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services')>('@/lib/services');
    return {
        ...actual,
        SERVICE_LABELS: ['Plumbing', 'Electrical', 'Painting'],
        toTitleCase: (s: string) => s,
    };
});

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: { diagnoses: { data: { id: VALID_UUID }, error: null } },
    });
});

describe('POST /api/diagnoses/direct', () => {
    it('returns 400 on invalid conversationId', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { conversationId: 'bad', trade: 'Plumbing' },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 on invalid trade', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { conversationId: VALID_UUID, trade: 'Wizardry' },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 on malformed JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns { id } on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { conversationId: VALID_UUID, trade: 'Plumbing', description: 'leak' },
            }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe(VALID_UUID);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { conversationId: VALID_UUID, trade: 'Plumbing' },
            }),
        );
        expect(res.status).toBe(500);
    });
});
