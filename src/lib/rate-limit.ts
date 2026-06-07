/* eslint-disable no-console */
/**
 * Distributed rate limiting with Upstash Redis.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (production),
 * rate-limit state is stored in Upstash Redis — shared across all Vercel
 * serverless instances so limits are accurate regardless of which instance
 * handles the request.
 *
 * When the env vars are absent (development / CI), falls back to a process-local
 * in-memory store. The in-memory store is per-instance and is NOT suitable for
 * production traffic — set up Upstash before going live.
 *
 * Setup:
 *   1. Create a free Upstash Redis database at https://console.upstash.com
 *   2. Copy the REST URL and token to your .env.local and Vercel env vars:
 *        UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *        UPSTASH_REDIS_REST_TOKEN=xxx
 *   3. npm install @upstash/ratelimit @upstash/redis
 */

// ── In-memory fallback (dev / CI) ────────────────────────────────────────────

type RateLimitKey = string;
type Bucket = { count: number; resetAt: number };

const _globalStore = (globalThis as Record<string, unknown>);
if (!_globalStore.__SCANDIO_RATE_LIMIT_STORE__) {
    _globalStore.__SCANDIO_RATE_LIMIT_STORE__ = new Map<RateLimitKey, Bucket>();
}
const memStore = _globalStore.__SCANDIO_RATE_LIMIT_STORE__ as Map<RateLimitKey, Bucket>;

export type RateLimitConfig = {
    windowMs: number;
    max: number;
};

export type RateLimitResult = {
    ok: boolean;
    remaining: number;
    resetAt: number;
};

function applyRateLimitMemory(params: {
    ip: string | null | undefined;
    bucket: string;
    config: RateLimitConfig;
}): RateLimitResult {
    const { ip, bucket, config } = params;
    const now = Date.now();
    const key = `${bucket}:${ip ?? 'unknown'}`;
    const existing = memStore.get(key);

    if (!existing || existing.resetAt <= now) {
        const resetAt = now + config.windowMs;
        memStore.set(key, { count: 1, resetAt });
        return { ok: true, remaining: config.max - 1, resetAt };
    }

    if (existing.count >= config.max) {
        return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    memStore.set(key, existing);
    return {
        ok: true,
        remaining: Math.max(0, config.max - existing.count),
        resetAt: existing.resetAt,
    };
}

// ── Upstash Redis (production) ────────────────────────────────────────────────

let _upstashCache:
    | {
          Ratelimit: typeof import('@upstash/ratelimit').Ratelimit;
          Redis: typeof import('@upstash/redis').Redis;
      }
    | null
    | 'unavailable' = null;

async function getUpstash() {
    if (_upstashCache === 'unavailable') return null;
    if (_upstashCache) return _upstashCache;

    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        _upstashCache = 'unavailable';
        return null;
    }

    try {
        const [{ Ratelimit }, { Redis }] = await Promise.all([
            import('@upstash/ratelimit'),
            import('@upstash/redis'),
        ]);
        _upstashCache = { Ratelimit, Redis };
        return _upstashCache;
    } catch {
        // Package not installed yet — fall back to in-memory silently
        _upstashCache = 'unavailable';
        return null;
    }
}

// Cache Ratelimit instances per bucket to avoid recreating them on every request
const _rlInstances = new Map<string, InstanceType<typeof import('@upstash/ratelimit').Ratelimit>>();

async function applyRateLimitUpstash(params: {
    ip: string | null | undefined;
    bucket: string;
    config: RateLimitConfig;
}): Promise<RateLimitResult | null> {
    const upstash = await getUpstash();
    if (!upstash) return null;

    const { Ratelimit, Redis } = upstash;

    let rl = _rlInstances.get(params.bucket);
    if (!rl) {
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
        rl = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(params.config.max, `${params.config.windowMs}ms`),
            prefix: `scandio:rl:${params.bucket}`,
        });
        _rlInstances.set(params.bucket, rl);
    }

    const identifier = `${params.bucket}:${params.ip ?? 'unknown'}`;
    const { success, remaining, reset } = await rl.limit(identifier);
    return { ok: success, remaining, resetAt: reset };
}

// ── Public interface (async) ──────────────────────────────────────────────────

export async function applyRateLimit(params: {
    ip: string | null | undefined;
    bucket: string;
    config: RateLimitConfig;
}): Promise<RateLimitResult> {
    const upstashResult = await applyRateLimitUpstash(params);
    if (upstashResult) return upstashResult;
    return applyRateLimitMemory(params);
}
