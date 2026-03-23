type RateLimitKey = string;

type Bucket = {
    count: number;
    resetAt: number;
};

const GLOBAL_RATE_LIMIT_STORE =
    (globalThis as any).__SCANDIO_RATE_LIMIT_STORE__ as Map<RateLimitKey, Bucket> |
    undefined;

const store: Map<RateLimitKey, Bucket> =
    GLOBAL_RATE_LIMIT_STORE ?? new Map<RateLimitKey, Bucket>();

if (!(globalThis as any).__SCANDIO_RATE_LIMIT_STORE__) {
    (globalThis as any).__SCANDIO_RATE_LIMIT_STORE__ = store;
}

export type RateLimitConfig = {
    windowMs: number;
    max: number;
};

export type RateLimitResult = {
    ok: boolean;
    remaining: number;
    resetAt: number;
};

function getKey(ip: string | null | undefined, bucket: string): RateLimitKey {
    return `${bucket}:${ip ?? 'unknown'}`;
}

export function applyRateLimit(params: {
    ip: string | null | undefined;
    bucket: string;
    config: RateLimitConfig;
}): RateLimitResult {
    const { ip, bucket, config } = params;
    const now = Date.now();
    const key = getKey(ip, bucket);
    const existing = store.get(key);

    if (!existing || existing.resetAt <= now) {
        const resetAt = now + config.windowMs;
        store.set(key, { count: 1, resetAt });
        return { ok: true, remaining: config.max - 1, resetAt };
    }

    if (existing.count >= config.max) {
        return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    store.set(key, existing);
    return {
        ok: true,
        remaining: Math.max(0, config.max - existing.count),
        resetAt: existing.resetAt,
    };
}

