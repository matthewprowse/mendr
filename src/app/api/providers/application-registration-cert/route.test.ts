import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

function postForm(parts: Record<string, File | string | null>): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(parts)) {
        if (v !== null) fd.set(k, v);
    }
    return new NextRequest('http://localhost/api/providers/application-registration-cert', {
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

describe('POST /api/providers/application-registration-cert', () => {
    it('returns 400 when file missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(postForm({}));
        expect(res.status).toBe(400);
    });

    it('returns 422 on unsupported mime', async () => {
        const file = new File([Buffer.from('a')], 'data.bin', { type: 'application/octet-stream' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ file }));
        expect(res.status).toBe(422);
    });

    it('returns 422 on oversized PDF', async () => {
        const big = new Uint8Array(11 * 1024 * 1024);
        const file = new File([big], 'cert.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ file }));
        expect(res.status).toBe(422);
    });

    it('returns 422 when storage upload fails', async () => {
        supabase = mockSupabaseClient({
            storageUploadResult: { data: null, error: { message: 'fail' } },
        });
        const file = new File([Buffer.from('a')], 'cert.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ file }));
        expect(res.status).toBe(422);
    });

    it('returns 200 with the path on success', async () => {
        const file = new File([Buffer.from('a')], 'cert.pdf', { type: 'application/pdf' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ file }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.bucket).toBe('gallery');
    });
});
