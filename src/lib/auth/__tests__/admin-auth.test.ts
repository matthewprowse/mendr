import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import {
    createAdminSession,
    verifyAdminToken,
    setAdminCookie,
    clearAdminCookie,
    ADMIN_COOKIE_NAME,
} from '@/lib/auth/admin-auth';

const PASSWORD = 'super-secret-admin-pw';
const originalPw = process.env.ADMIN_PASSWORD;

beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
});
afterEach(() => {
    vi.useRealTimers();
    if (originalPw === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPw;
});

describe('createAdminSession', () => {
    it('returns a <expiry>.<sig> token with a future expiry', async () => {
        const token = await createAdminSession();
        expect(token).toMatch(/^\d+\.[0-9a-f]+$/);
        const expiry = Number(token!.split('.')[0]);
        expect(expiry).toBeGreaterThan(Date.now());
    });

    it('returns null when ADMIN_PASSWORD is not configured', async () => {
        delete process.env.ADMIN_PASSWORD;
        expect(await createAdminSession()).toBeNull();
    });
});

describe('verifyAdminToken', () => {
    it('accepts a freshly created token', async () => {
        const token = await createAdminSession();
        expect(await verifyAdminToken(token!)).toBe(true);
    });

    it('rejects an expired token', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
        const token = await createAdminSession();
        // Advance past the 24h window.
        vi.setSystemTime(new Date('2026-06-16T13:00:00Z'));
        expect(await verifyAdminToken(token!)).toBe(false);
    });

    it('rejects a token signed with a different password', async () => {
        const token = await createAdminSession();
        process.env.ADMIN_PASSWORD = 'a-different-password';
        expect(await verifyAdminToken(token!)).toBe(false);
    });

    it('rejects a tampered signature', async () => {
        const token = await createAdminSession();
        const [expiry, sig] = token!.split('.');
        const flipped = sig[sig.length - 1] === '0' ? '1' : '0';
        const tampered = `${expiry}.${sig.slice(0, -1)}${flipped}`;
        expect(await verifyAdminToken(tampered)).toBe(false);
    });

    it('rejects malformed and empty tokens', async () => {
        expect(await verifyAdminToken(undefined)).toBe(false);
        expect(await verifyAdminToken('')).toBe(false);
        expect(await verifyAdminToken('no-dot-here')).toBe(false);
        expect(await verifyAdminToken('notanumber.deadbeef')).toBe(false);
    });

    it('rejects everything when ADMIN_PASSWORD is not configured', async () => {
        const token = await createAdminSession();
        delete process.env.ADMIN_PASSWORD;
        expect(await verifyAdminToken(token!)).toBe(false);
    });
});

describe('admin cookie helpers', () => {
    it('sets the admin session cookie on a response', () => {
        const res = NextResponse.json({ ok: true });
        setAdminCookie(res, 'tok123');
        const cookie = res.cookies.get(ADMIN_COOKIE_NAME);
        expect(cookie?.value).toBe('tok123');
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.sameSite).toBe('lax');
    });

    it('clears the admin session cookie', () => {
        const res = NextResponse.json({ ok: true });
        setAdminCookie(res, 'tok123');
        clearAdminCookie(res);
        // A delete sets the cookie to an empty, immediately-expiring value.
        expect(res.cookies.get(ADMIN_COOKIE_NAME)?.value ?? '').toBe('');
    });
});
