/**
 * Contract tests for POST /api/beta-access.
 *
 * The route ungates the rest of the app once the user enters the correct
 * COMING_SOON_PASSWORD. When the env var is unset the gate is disabled.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

const ORIGINAL_PW = process.env.COMING_SOON_PASSWORD;

beforeEach(() => {
    process.env.COMING_SOON_PASSWORD = 'open-sesame';
});

afterEach(() => {
    if (ORIGINAL_PW === undefined) {
        delete process.env.COMING_SOON_PASSWORD;
    } else {
        process.env.COMING_SOON_PASSWORD = ORIGINAL_PW;
    }
});

describe('POST /api/beta-access', () => {
    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: '{ broken' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 401 with wrong password', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'wrong' } }));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe('Wrong password');
    });

    it('returns 200 + sets a beta_access cookie on correct password', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'open-sesame' } }));
        expect(res.status).toBe(200);
        const cookies = res.cookies.get('beta_access');
        expect(cookies?.value).toBe('granted');
    });

    it('returns 200 when COMING_SOON_PASSWORD is unset (gate disabled)', async () => {
        delete process.env.COMING_SOON_PASSWORD;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'anything' } }));
        expect(res.status).toBe(200);
    });

    it('treats whitespace-padded password as the same value', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { password: '  open-sesame  ' } }),
        );
        expect(res.status).toBe(200);
    });
});
