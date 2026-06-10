/**
 * Contract tests for POST /api/beta-access.
 *
 * The route ungates the rest of the app once the user enters a valid early-access
 * code or the master COMING_SOON_PASSWORD. Individual codes are validated via the
 * redeem_beta_access_code() RPC, which returns the code id on success or null on
 * a wrong / inactive / expired / exhausted code. When COMING_SOON_PASSWORD is
 * unset the gate is disabled and everyone is let through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
    getCallerIp: vi.fn(() => '203.0.113.7'),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const ORIGINAL_PW = process.env.COMING_SOON_PASSWORD;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMING_SOON_PASSWORD = 'open-sesame';
    // Default: the RPC reports "no matching code" (null).
    supabase = mockSupabaseClient({ rpc: { redeem_beta_access_code: { data: null, error: null } } });
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

    it('returns 401 when the code is unknown (RPC returns null)', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'wrong' } }));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe('Wrong password');
    });

    it('returns 200 + sets a beta_access cookie on the master password', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'open-sesame' } }));
        expect(res.status).toBe(200);
        expect(res.cookies.get('beta_access')?.value).toBe('granted');
    });

    it('returns 200 + sets the cookie on a valid individual code', async () => {
        supabase = mockSupabaseClient({
            rpc: { redeem_beta_access_code: { data: 'code-uuid-1', error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'FRIEND-01' } }));
        expect(res.status).toBe(200);
        expect(res.cookies.get('beta_access')?.value).toBe('granted');
    });

    it('returns 200 when COMING_SOON_PASSWORD is unset (gate disabled)', async () => {
        delete process.env.COMING_SOON_PASSWORD;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { password: 'anything' } }));
        expect(res.status).toBe(200);
    });

    it('treats whitespace-padded master password as the same value', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { password: '  open-sesame  ' } }),
        );
        expect(res.status).toBe(200);
    });
});
