/**
 * Unit tests for the quota check extracted from /api/diagnose/route.ts.
 *
 * The quota check has multiple short-circuit paths (first message gating,
 * env-disable flag, image_thought_only warm-up, anonymous cookie). These
 * tests exercise each branch with the Supabase clients mocked at the
 * module boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rpcSpy = vi.fn();

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
    }),
    createSupabaseAdminClient: async () => ({
        rpc: rpcSpy,
    }),
}));

vi.mock('@/lib/rate-limit-config', () => ({
    isRateLimitBypassed: vi.fn(() => false),
}));

beforeEach(() => {
    rpcSpy.mockReset();
    delete process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA;
});

function makeReq(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost:3000/api/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
    });
}

describe('checkDiagnosisQuota — short-circuits', () => {
    it('returns no blocking response when body is null (treated as first message)', async () => {
        // Body null means we still check quota — but RPC returns within limit.
        rpcSpy.mockResolvedValueOnce({ data: 1, error: null });
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: null });
        expect(result.blockingResponse).toBeNull();
    });

    it('skips quota when body has history (follow-up, not first message)', async () => {
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({
            req: makeReq(),
            body: { history: [{ role: 'user' }] },
        });
        expect(result.blockingResponse).toBeNull();
        expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('skips quota when DISABLE_DIAGNOSIS_DAILY_QUOTA=true', async () => {
        process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA = 'true';
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: {} });
        expect(result.blockingResponse).toBeNull();
        expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('skips quota for image_thought_only warm-up', async () => {
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({
            req: makeReq(),
            body: { analysisPhase: 'image_thought_only' },
        });
        expect(result.blockingResponse).toBeNull();
        expect(rpcSpy).not.toHaveBeenCalled();
    });
});

describe('checkDiagnosisQuota — anonymous cookie', () => {
    it('issues a Set-Cookie when no scandio_anon cookie present', async () => {
        rpcSpy.mockResolvedValueOnce({ data: 1, error: null });
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: {} });
        expect(result.blockingResponse).toBeNull();
        expect(result.extraHeaders['Set-Cookie']).toMatch(/^scandio_anon=/);
    });

    it('reuses an existing scandio_anon cookie when present', async () => {
        rpcSpy.mockResolvedValueOnce({ data: 1, error: null });
        const cookie = 'scandio_anon=11111111-2222-3333-4444-555555555555';
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({
            req: makeReq({ cookie }),
            body: {},
        });
        expect(result.blockingResponse).toBeNull();
        expect(result.extraHeaders['Set-Cookie']).toBeUndefined();
    });
});

describe('checkDiagnosisQuota — quota exceeded', () => {
    it('returns a 429 blocking response when RPC reports over-limit usage', async () => {
        rpcSpy.mockResolvedValueOnce({ data: 99, error: null });
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: {} });
        expect(result.blockingResponse).not.toBeNull();
        expect(result.blockingResponse?.status).toBe(429);
        const body = await result.blockingResponse?.json();
        expect(body.error).toBe('quota_exceeded');
        expect(body.limit).toBe(3); // anonymous limit
    });
});

describe('checkDiagnosisQuota — RPC failure is non-fatal', () => {
    it('allows through when the RPC returns an error', async () => {
        rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'rpc not found' } });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: {} });
        expect(result.blockingResponse).toBeNull();
        warnSpy.mockRestore();
    });

    it('allows through when the RPC throws', async () => {
        rpcSpy.mockRejectedValueOnce(new Error('connection lost'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { checkDiagnosisQuota } = await import('../quota');
        const result = await checkDiagnosisQuota({ req: makeReq(), body: {} });
        expect(result.blockingResponse).toBeNull();
        warnSpy.mockRestore();
    });
});
