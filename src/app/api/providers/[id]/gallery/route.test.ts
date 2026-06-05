import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

function postForm(parts: Record<string, string | File | File[]>): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(parts)) {
        if (Array.isArray(v)) {
            for (const f of v) fd.append(k, f);
        } else {
            fd.set(k, v);
        }
    }
    return new NextRequest('http://localhost/api/providers/p1/gallery', {
        method: 'POST',
        body: fd,
    });
}

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            provider_images: { data: [], error: null },
            // Unclaimed provider → onboarding enrichment is allowed (H5).
            providers: { data: { claimed_by_user_id: null }, error: null },
        },
        storageUploadResult: { data: { path: 'p' }, error: null },
    });
});

describe('POST /api/providers/[id]/gallery', () => {
    it('returns 400 when no files', async () => {
        const { POST } = await import('./route');
        const res = await POST(postForm({}), ctx('p1'));
        expect(res.status).toBe(400);
    });

    it('returns 400 for non-image files', async () => {
        const file = new File([Buffer.from('a')], 'doc.txt', { type: 'text/plain' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ files: [file] }), ctx('p1'));
        expect(res.status).toBe(400);
    });

    it('returns 503 when provider_images table is missing', async () => {
        supabase = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: null }, error: null },
                provider_images: {
                    data: null,
                    error: { code: '42P01', message: 'relation provider_images does not exist' },
                },
            },
        });
        const file = new File([Buffer.from('a')], 'x.jpg', { type: 'image/jpeg' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ files: [file] }), ctx('p1'));
        expect(res.status).toBe(503);
    });

    it('returns ok on success', async () => {
        const file = new File([Buffer.from('a')], 'x.jpg', { type: 'image/jpeg' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ files: [file] }), ctx('p1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.uploaded).toBe(1);
    });

    it('returns 404 when the provider does not exist (H5)', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_images: { data: [], error: null },
                providers: { data: null, error: null },
            },
            storageUploadResult: { data: { path: 'p' }, error: null },
        });
        const file = new File([Buffer.from('a')], 'x.jpg', { type: 'image/jpeg' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ files: [file] }), ctx('ghost'));
        expect(res.status).toBe(404);
    });

    it('forbids an unauthenticated write to a claimed provider (H5)', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_images: { data: [], error: null },
                providers: { data: { claimed_by_user_id: 'owner-1' }, error: null },
            },
            storageUploadResult: { data: { path: 'p' }, error: null },
        });
        const file = new File([Buffer.from('a')], 'x.jpg', { type: 'image/jpeg' });
        const { POST } = await import('./route');
        const res = await POST(postForm({ files: [file] }), ctx('p1'));
        expect(res.status).toBe(403);
    });
});
