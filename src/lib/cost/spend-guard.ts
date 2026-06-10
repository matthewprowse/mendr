/**
 * Global daily circuit breaker for the paid Google Maps/Places proxies
 * (finding M2). These endpoints are unauthenticated and protected only by
 * per-IP rate limits, so a distributed caller could still run up the Google
 * bill. A single global daily call counter caps total spend across all callers.
 *
 * Backed by the same Upstash Redis as rate limiting. Fails OPEN when Redis is
 * unavailable (a Redis outage must not take location features down) but logs
 * loudly in production so the gap is visible.
 */

import { NextResponse } from 'next/server';

type RedisClient = { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> };

let _redis: RedisClient | null | 'unavailable' = null;

async function getRedis(): Promise<RedisClient | null> {
    if (_redis === 'unavailable') return null;
    if (_redis) return _redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        _redis = 'unavailable';
        return null;
    }
    try {
        const { Redis } = await import('@upstash/redis');
        _redis = new Redis({ url, token }) as unknown as RedisClient;
        return _redis;
    } catch {
        _redis = 'unavailable';
        return null;
    }
}

const DEFAULT_DAILY_CAP = 10000;

function dailyCap(): number {
    const v = parseInt(process.env.GOOGLE_DAILY_CALL_CAP ?? '', 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_CAP;
}

function utcDay(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Increment today's global Google-call counter and report whether the daily cap
 * has been exceeded. Call this only for actual outbound Google requests (i.e.
 * after a cache miss), so cached responses don't consume the budget.
 */
export async function googleSpendExceeded(api: string): Promise<boolean> {
    const redis = await getRedis();
    if (!redis) {
        if (process.env.NODE_ENV === 'production') {
            console.error(
                `[spend-guard] Upstash unavailable — Google daily spend cap NOT enforced for ${api}.`,
            );
        }
        return false;
    }
    try {
        const key = `spend:google:${utcDay()}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 60 * 60 * 36); // ~1.5 days
        if (count > dailyCap()) {
            console.error(`[spend-guard] Google daily call cap (${dailyCap()}) hit; tripping breaker for ${api}.`);
            return true;
        }
        return false;
    } catch (e) {
        console.warn('[spend-guard] counter error, allowing through:', e);
        return false;
    }
}

/** Standard 503 response when the breaker is open. */
export function spendBreakerResponse(): NextResponse {
    return NextResponse.json(
        {
            error: 'temporarily_unavailable',
            message: 'The daily limit for map and location lookups has been reached. Please try again tomorrow.',
        },
        { status: 503 },
    );
}
