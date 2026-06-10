import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/ai/ai-client', () => ({
    getGeminiModel: () => ({
        generateContent: vi.fn(async () => ({
            response: { text: () => '{}' },
        })),
    }),
}));
vi.mock('@/lib/providers/provider-display-name', () => ({
    normalizeProviderName: (s: string) => s.toLowerCase(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: [], error: null } },
    });
});

describe('process-provider-applications', () => {
    it('GET returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/process-provider-applications' }));
        expect(res.status).toBe(401);
    });

    it('POST returns 401 without cron auth', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', path: '/api/cron/process-provider-applications' }));
        expect(res.status).toBe(401);
    });

    it('GET returns 200 with cron auth and no queued rows', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/process-provider-applications', cron: true }));
        expect(res.status).toBe(200);
    });

    it('POST returns 200 with cron auth', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', path: '/api/cron/process-provider-applications', cron: true }),
        );
        expect(res.status).toBe(200);
    });
});
