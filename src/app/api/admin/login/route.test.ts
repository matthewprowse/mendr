import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/safe-redirect', () => ({
    safeRedirectPath: (raw: unknown, fallback: string) => {
        if (typeof raw === 'string' && raw.startsWith('/admin')) return raw;
        return fallback;
    },
}));

vi.mock('@/lib/auth/admin-auth', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/admin-auth')>('@/lib/auth/admin-auth');
    return {
        ...actual,
        createAdminSession: vi.fn(async () => 'session-token'),
        setAdminCookie: vi.fn((res, _t) => res),
        clearAdminCookie: vi.fn((res) => res),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_PASSWORD = 'secret';
});

describe('POST /api/admin/login', () => {
    it('returns 401 on wrong password', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'nope' } }));
        expect(res.status).toBe(401);
    });

    it('returns 401 when ADMIN_PASSWORD is unset', async () => {
        delete process.env.ADMIN_PASSWORD;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'secret' } }));
        expect(res.status).toBe(401);
    });

    it('returns 500 when session token creation fails', async () => {
        const adminAuth = await import('@/lib/auth/admin-auth');
        vi.mocked(adminAuth.createAdminSession).mockResolvedValueOnce(null);
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'secret' } }));
        expect(res.status).toBe(500);
    });

    it('returns ok + redirect on correct password', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'secret' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.redirect).toBe('/admin');
    });

    it('honours a safe next path', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { password: 'secret', next: '/admin/contact' } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.redirect).toBe('/admin/contact');
    });
});

describe('DELETE /api/admin/login', () => {
    it('clears the admin cookie and returns ok', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });
});
