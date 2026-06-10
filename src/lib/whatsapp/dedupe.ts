/* eslint-disable no-console */
/**
 * Webhook idempotency (Phase C, Workstream 1).
 *
 * Meta retries webhook deliveries until it sees a 200, and may deliver the
 * same message id more than once. `claimMessage` returns true exactly once
 * per id. Redis (Upstash) when configured; an in-process Map fallback
 * otherwise — fine for dev, NOT for multi-instance production, hence the
 * startup warning.
 */

import { Redis } from '@upstash/redis';

const TTL_SECONDS = 24 * 60 * 60;
const PREFIX = 'wa:msg:';

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
    if (redis !== undefined) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        redis = new Redis({ url, token });
    } else {
        redis = null;
        if (process.env.NODE_ENV === 'production') {
            console.warn(
                '[whatsapp/dedupe] Upstash not configured — falling back to in-memory dedupe (unsafe across instances)',
            );
        }
    }
    return redis;
}

const memory = new Map<string, number>();
function memoryClaim(id: string): boolean {
    const now = Date.now();
    // Opportunistic sweep.
    if (memory.size > 5000) {
        for (const [k, exp] of memory) if (exp < now) memory.delete(k);
    }
    const key = PREFIX + id;
    const existing = memory.get(key);
    if (existing && existing > now) return false;
    memory.set(key, now + TTL_SECONDS * 1000);
    return true;
}

/** True exactly once per message id (within the TTL). Fail-open on Redis errors. */
export async function claimMessage(messageId: string): Promise<boolean> {
    const r = getRedis();
    if (!r) return memoryClaim(messageId);
    try {
        const res = await r.set(PREFIX + messageId, '1', { nx: true, ex: TTL_SECONDS });
        return res === 'OK';
    } catch (e) {
        console.error('[whatsapp/dedupe] redis error — processing anyway', e);
        return true;
    }
}
