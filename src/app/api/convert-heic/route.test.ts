import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('heic-convert', () => ({
    default: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff])), // dummy JPEG header
}));

import { NextRequest } from 'next/server';

function makeFormRequest(file: File | null): NextRequest {
    const fd = new FormData();
    if (file) fd.set('file', file);
    return new NextRequest('http://localhost/api/convert-heic', {
        method: 'POST',
        body: fd,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/convert-heic', () => {
    it('returns 400 when no file is supplied', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeFormRequest(null));
        expect(res.status).toBe(400);
    });

    it('returns 400 for a non-HEIC file', async () => {
        const { POST } = await import('./route');
        const file = new File([Buffer.from('hello')], 'cat.png', { type: 'image/png' });
        const res = await POST(makeFormRequest(file));
        expect(res.status).toBe(400);
    });

    it('returns 200 with a JPEG data URL on success', async () => {
        const { POST } = await import('./route');
        const file = new File([Buffer.from([0])], 'photo.heic', { type: 'image/heic' });
        const res = await POST(makeFormRequest(file));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('returns 500 when conversion throws', async () => {
        const heic = await import('heic-convert');
        vi.mocked(heic.default).mockRejectedValueOnce(new Error('bad heic'));
        const { POST } = await import('./route');
        const file = new File([Buffer.from([0])], 'photo.heic', { type: 'image/heic' });
        const res = await POST(makeFormRequest(file));
        expect(res.status).toBe(500);
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const file = new File([Buffer.from([0])], 'photo.heic', { type: 'image/heic' });
        const res = await POST(makeFormRequest(file));
        expect(res.status).toBe(429);
    });
});
