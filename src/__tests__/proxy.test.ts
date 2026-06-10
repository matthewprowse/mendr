/**
 * Unit tests for src/proxy.ts — the beta access gate.
 *
 * This middleware guards the whole app pre-launch, so the contract matters:
 *   - gate disabled when COMING_SOON_PASSWORD is empty/unset
 *   - gated visitors without the beta_access=granted cookie → redirect /launch
 *   - the cookie value must match exactly
 *   - public prefixes and exact paths bypass the gate
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const ORIGINAL_PASSWORD = process.env.COMING_SOON_PASSWORD;

function request(pathname: string, cookies: Record<string, string> = {}): NextRequest {
    const headers = new Headers();
    const cookieHeader = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    if (cookieHeader) headers.set('cookie', cookieHeader);
    return new NextRequest(`http://localhost:3000${pathname}`, { headers });
}

afterEach(() => {
    if (ORIGINAL_PASSWORD === undefined) delete process.env.COMING_SOON_PASSWORD;
    else process.env.COMING_SOON_PASSWORD = ORIGINAL_PASSWORD;
});

describe('proxy — gate disabled', () => {
    beforeEach(() => {
        delete process.env.COMING_SOON_PASSWORD;
    });

    it('passes everything through when COMING_SOON_PASSWORD is unset', async () => {
        const res = await proxy(request('/start'));
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
    });

    it('treats an empty COMING_SOON_PASSWORD as disabled', async () => {
        process.env.COMING_SOON_PASSWORD = '';
        const res = await proxy(request('/start'));
        expect(res.headers.get('location')).toBeNull();
    });
});

describe('proxy — gate enabled', () => {
    beforeEach(() => {
        process.env.COMING_SOON_PASSWORD = 'sekret';
    });

    it('redirects a cookieless visitor to /launch', async () => {
        const res = await proxy(request('/start'));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(new URL(res.headers.get('location')!).pathname).toBe('/launch');
    });

    it('redirects when the cookie value is wrong', async () => {
        const res = await proxy(request('/start', { beta_access: 'nope' }));
        expect(new URL(res.headers.get('location')!).pathname).toBe('/launch');
    });

    it('passes through with beta_access=granted', async () => {
        const res = await proxy(request('/start', { beta_access: 'granted' }));
        expect(res.headers.get('location')).toBeNull();
    });

    it.each([
        '/launch',
        '/api/beta-access',
        '/api/contact',
        '/api/geocode/lookup',
        '/api/providers/search',
        '/admin/beta-codes',
        '/_next/static/chunk.js',
        '/fonts/geist.woff2',
        '/docs/terms',
        '/landing1',
        '/landing2',
    ])('lets the public path %s through without a cookie', async (path) => {
        const res = await proxy(request(path));
        expect(res.headers.get('location')).toBeNull();
    });

    it.each(['/favicon.ico', '/site.webmanifest'])(
        'lets the exact public path %s through',
        async (path) => {
            const res = await proxy(request(path));
            expect(res.headers.get('location')).toBeNull();
        },
    );

    it('still gates a path that merely contains a public prefix', async () => {
        const res = await proxy(request('/not/launch'));
        expect(new URL(res.headers.get('location')!).pathname).toBe('/launch');
    });
});
