import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

function postForm(parts: Record<string, string | File>): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(parts)) {
        fd.set(k, v);
    }
    return new NextRequest('http://localhost/api/providers/application-document', {
        method: 'POST',
        body: fd,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        storageUploadResult: { data: { path: 'p' }, error: null },
    });
});

describe('POST /api/providers/application-document', () => {
    it('returns 400 when kind is invalid', async () => {
        const file = new File([Buffer.from('a')], 'doc.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ kind: 'wat', file }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when file missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(postForm({ kind: 'certification' }));
        expect(res.status).toBe(400);
    });

    it('returns 422 when selfie is not an image', async () => {
        const file = new File([Buffer.from('a')], 'doc.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ kind: 'kyc_selfie', file }));
        expect(res.status).toBe(422);
    });

    it('returns 422 on oversized file', async () => {
        const big = new Uint8Array(11 * 1024 * 1024);
        const file = new File([big], 'big.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ kind: 'certification', file }));
        expect(res.status).toBe(422);
    });

    it('returns ok on valid certification PDF', async () => {
        const file = new File([Buffer.from('a')], 'cert.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ kind: 'certification', file }));
        expect(res.status).toBe(200);
    });
});
