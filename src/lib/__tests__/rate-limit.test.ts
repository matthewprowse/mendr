import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';

// We must clear the global in-memory store between tests since the module
// stashes it on globalThis to survive HMR. Re-import after env mutation does
// NOT recreate it.
function resetStore(): Map<string, unknown> {
    const g = globalThis as Record<string, unknown>;
    const fresh = new Map<string, unknown>();
    g.__SCANDIO_RATE_LIMIT_STORE__ = fresh;
    return fresh;
}

// ---------------------------------------------------------------------------
// In-memory fallback (no Upstash env)
// ---------------------------------------------------------------------------

describe('applyRateLimit — in-memory fallback', () => {
    const ORIG_URL = process.env.UPSTASH_REDIS_REST_URL;
    const ORIG_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    beforeEach(() => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        resetStore();
        vi.resetModules();
    });

    afterEach(() => {
        if (ORIG_URL) process.env.UPSTASH_REDIS_REST_URL = ORIG_URL;
        if (ORIG_TOKEN) process.env.UPSTASH_REDIS_REST_TOKEN = ORIG_TOKEN;
    });

    it('first call succeeds with full bucket minus one remaining', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const res = await applyRateLimit({
            ip: '1.1.1.1',
            bucket: 'test',
            config: { windowMs: 60_000, max: 5 },
        });
        expect(res.ok).toBe(true);
        expect(res.remaining).toBe(4);
        expect(res.resetAt).toBeGreaterThan(Date.now());
    });

    it('decrements remaining on each successive call within the window', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 3 };
        const r1 = await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        const r2 = await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        const r3 = await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        expect([r1.remaining, r2.remaining, r3.remaining]).toEqual([2, 1, 0]);
        expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, true]);
    });

    it('returns ok=false with remaining=0 once max is exceeded', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 2 };
        await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        const r3 = await applyRateLimit({ ip: 'a', bucket: 'b', config: cfg });
        expect(r3.ok).toBe(false);
        expect(r3.remaining).toBe(0);
    });

    it('keeps separate buckets for different bucket names', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 1 };
        const a = await applyRateLimit({ ip: 'x', bucket: 'A', config: cfg });
        const b = await applyRateLimit({ ip: 'x', bucket: 'B', config: cfg });
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
    });

    it('keeps separate buckets for different IPs', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 1 };
        const a = await applyRateLimit({ ip: 'ip-1', bucket: 'shared', config: cfg });
        const b = await applyRateLimit({ ip: 'ip-2', bucket: 'shared', config: cfg });
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
    });

    it('treats null/undefined IP as a shared "unknown" key', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 1 };
        const first = await applyRateLimit({ ip: null, bucket: 't', config: cfg });
        const second = await applyRateLimit({ ip: undefined, bucket: 't', config: cfg });
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
    });

    it('resets the bucket once the window elapses', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 10, max: 1 };
        const a = await applyRateLimit({ ip: 'r', bucket: 't', config: cfg });
        expect(a.ok).toBe(true);
        // Wait > windowMs
        await new Promise((res) => setTimeout(res, 20));
        const b = await applyRateLimit({ ip: 'r', bucket: 't', config: cfg });
        expect(b.ok).toBe(true);
        expect(b.remaining).toBe(0);
    });

    it('resetAt is approximately now + windowMs on first call', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const before = Date.now();
        const r = await applyRateLimit({
            ip: 'q',
            bucket: 't',
            config: { windowMs: 30_000, max: 5 },
        });
        const after = Date.now();
        expect(r.resetAt).toBeGreaterThanOrEqual(before + 30_000);
        expect(r.resetAt).toBeLessThanOrEqual(after + 30_000);
    });

    it('shares the bucket across calls with the same (bucket, ip) key', async () => {
        const { applyRateLimit } = await import('@/lib/rate-limit');
        const cfg = { windowMs: 60_000, max: 4 };
        const first = await applyRateLimit({ ip: 'k', bucket: 'shared', config: cfg });
        const second = await applyRateLimit({ ip: 'k', bucket: 'shared', config: cfg });
        // Same resetAt value — calls join the same bucket
        expect(first.resetAt).toBe(second.resetAt);
    });
});

// ---------------------------------------------------------------------------
// Upstash production path — mocked at module boundary
// ---------------------------------------------------------------------------

describe('applyRateLimit — Upstash production path', () => {
    const ORIG_URL = process.env.UPSTASH_REDIS_REST_URL;
    const ORIG_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    beforeEach(() => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
        resetStore();
        vi.resetModules();
    });

    afterEach(() => {
        if (ORIG_URL) process.env.UPSTASH_REDIS_REST_URL = ORIG_URL;
        else delete process.env.UPSTASH_REDIS_REST_URL;
        if (ORIG_TOKEN) process.env.UPSTASH_REDIS_REST_TOKEN = ORIG_TOKEN;
        else delete process.env.UPSTASH_REDIS_REST_TOKEN;
        vi.doUnmock('@upstash/ratelimit');
        vi.doUnmock('@upstash/redis');
    });

    it('delegates to Upstash when both env vars are set, passing through identifier and result', async () => {
        const limitMock = vi.fn().mockResolvedValue({
            success: true,
            remaining: 9,
            reset: 1_700_000_000_000,
        });

        class FakeRatelimit {
            static slidingWindow = vi.fn().mockReturnValue({ kind: 'sw' });
            constructor() { /* noop */ }
            limit = limitMock;
        }

        class FakeRedis {
            constructor(_: unknown) { /* noop */ }
        }

        vi.doMock('@upstash/ratelimit', () => ({ Ratelimit: FakeRatelimit }));
        vi.doMock('@upstash/redis', () => ({ Redis: FakeRedis }));

        const { applyRateLimit } = await import('@/lib/rate-limit');
        const result = await applyRateLimit({
            ip: '8.8.8.8',
            bucket: 'diagnose',
            config: { windowMs: 60_000, max: 10 },
        });

        expect(result).toEqual({ ok: true, remaining: 9, resetAt: 1_700_000_000_000 });
        expect(limitMock).toHaveBeenCalledTimes(1);
        // Identifier format is `${bucket}:${ip}`.
        expect(limitMock).toHaveBeenCalledWith('diagnose:8.8.8.8');
        // The sliding-window limiter is constructed with the bucket max + window string.
        expect(FakeRatelimit.slidingWindow).toHaveBeenCalledWith(10, '60000ms');
    });

    it('uses `unknown` identifier suffix when ip is null', async () => {
        const limitMock = vi.fn().mockResolvedValue({
            success: true,
            remaining: 0,
            reset: 1,
        });
        class FakeRatelimit {
            static slidingWindow = vi.fn().mockReturnValue({});
            limit = limitMock;
        }
        class FakeRedis { constructor() { /* */ } }

        vi.doMock('@upstash/ratelimit', () => ({ Ratelimit: FakeRatelimit }));
        vi.doMock('@upstash/redis', () => ({ Redis: FakeRedis }));

        const { applyRateLimit } = await import('@/lib/rate-limit');
        await applyRateLimit({
            ip: null,
            bucket: 'public',
            config: { windowMs: 1000, max: 1 },
        });
        expect(limitMock).toHaveBeenCalledWith('public:unknown');
    });

    it('reports ok=false when Upstash returns success=false', async () => {
        const limitMock = vi.fn().mockResolvedValue({
            success: false,
            remaining: 0,
            reset: 1_700_000_000_000,
        });
        class FakeRatelimit {
            static slidingWindow = vi.fn().mockReturnValue({});
            limit = limitMock;
        }
        class FakeRedis { constructor() { /* */ } }

        vi.doMock('@upstash/ratelimit', () => ({ Ratelimit: FakeRatelimit }));
        vi.doMock('@upstash/redis', () => ({ Redis: FakeRedis }));

        const { applyRateLimit } = await import('@/lib/rate-limit');
        const res = await applyRateLimit({
            ip: '1.2.3.4',
            bucket: 'tight',
            config: { windowMs: 60_000, max: 1 },
        });
        expect(res.ok).toBe(false);
        expect(res.remaining).toBe(0);
    });

    it('falls back to in-memory if the Upstash module import fails', async () => {
        // Make the import throw — `getUpstash` catches and caches "unavailable".
        vi.doMock('@upstash/ratelimit', () => {
            throw new Error('missing module');
        });
        vi.doMock('@upstash/redis', () => {
            throw new Error('missing module');
        });

        const { applyRateLimit } = await import('@/lib/rate-limit');
        const res = await applyRateLimit({
            ip: '5.5.5.5',
            bucket: 'fallback',
            config: { windowMs: 60_000, max: 2 },
        });
        // In-memory bucket creates fresh entry → ok=true, remaining=1.
        expect(res.ok).toBe(true);
        expect(res.remaining).toBe(1);
    });

    it('only constructs the Ratelimit instance once per bucket (instance cache)', async () => {
        const limitMock = vi.fn().mockResolvedValue({
            success: true,
            remaining: 1,
            reset: 1,
        });
        const ctorSpy = vi.fn();
        class FakeRatelimit {
            static slidingWindow = vi.fn().mockReturnValue({});
            constructor(_: unknown) { ctorSpy(); }
            limit = limitMock;
        }
        class FakeRedis { constructor() { /* */ } }

        vi.doMock('@upstash/ratelimit', () => ({ Ratelimit: FakeRatelimit }));
        vi.doMock('@upstash/redis', () => ({ Redis: FakeRedis }));

        const { applyRateLimit } = await import('@/lib/rate-limit');
        await applyRateLimit({
            ip: 'a',
            bucket: 'cached',
            config: { windowMs: 1000, max: 1 },
        });
        await applyRateLimit({
            ip: 'b',
            bucket: 'cached',
            config: { windowMs: 1000, max: 1 },
        });
        expect(ctorSpy).toHaveBeenCalledTimes(1);
        expect(limitMock).toHaveBeenCalledTimes(2);
    });
});
