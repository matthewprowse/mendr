import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';
import { NextRequest } from 'next/server';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

function postForm(parts: Record<string, string | File | null>): NextRequest {
    const fd = new FormData();
    for (const [k, v] of Object.entries(parts)) {
        if (v !== null) fd.set(k, v);
    }
    return new NextRequest('http://localhost/api/upload-image', { method: 'POST', body: fd });
}

const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    supabase = mockSupabaseClient({
        tables: { diagnoses: { data: { id: VALID_UUID }, error: null } },
        storageUploadResult: { data: { path: 'gallery/x' }, error: null },
    });
});

describe('POST /api/upload-image', () => {
    it('returns 400 when conversationId missing or invalid', async () => {
        const { POST } = await import('./route');
        const file = new File([jpegMagic], 'x.jpg', { type: 'image/jpeg' });
        const res = await POST(postForm({ file, conversationId: 'not-uuid' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when file missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(postForm({ conversationId: VALID_UUID }));
        expect(res.status).toBe(400);
    });

    it('returns 415 on unsupported file content', async () => {
        const { POST } = await import('./route');
        const file = new File([Buffer.from('not an image')], 'x.txt', { type: 'image/jpeg' });
        const res = await POST(postForm({ file, conversationId: VALID_UUID }));
        expect(res.status).toBe(415);
    });

    it('returns 413 on oversized file', async () => {
        const { POST } = await import('./route');
        const big = new Uint8Array(11 * 1024 * 1024);
        big.set(jpegMagic);
        const file = new File([big], 'x.jpg', { type: 'image/jpeg' });
        const res = await POST(postForm({ file, conversationId: VALID_UUID }));
        expect(res.status).toBe(413);
    });

    it('returns imageUrl on success', async () => {
        const { POST } = await import('./route');
        const file = new File([jpegMagic], 'photo.jpg', { type: 'image/jpeg' });
        const res = await POST(postForm({ file, conversationId: VALID_UUID }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.imageUrl).toMatch(/^https:\/\/supabase\.test\/storage/);
    });
});
