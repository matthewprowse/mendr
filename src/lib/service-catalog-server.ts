import { Redis } from '@upstash/redis';
import { SERVICE_LABELS } from '@/lib/services';

const REDIS_KEY = 'scandio:service_catalog:active_labels_v1';
const TTL_SEC = 300;
const TTL_MS = TTL_SEC * 1000;

let memoryCache: { labels: string[]; expiresAt: number } | null = null;
let inFlight: Promise<string[]> | null = null;

/**
 * Returns the canonical service labels from the TypeScript constant.
 * The `services` Supabase table was removed — SERVICE_LABELS in services.ts
 * is now the single source of truth.
 */
function loadLabelsFromConstant(): string[] {
    return SERVICE_LABELS.filter((l) => l.trim().length > 0);
}

function redisClient(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

/**
 * Active service labels with Upstash Redis (cross-instance) and in-process fallback.
 * Used by POST /api/diagnose and GET /api/service-catalog.
 */
export async function getServiceCatalogLabelsCached(): Promise<string[]> {
    const now = Date.now();
    if (memoryCache && now < memoryCache.expiresAt) {
        return memoryCache.labels;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const redis = redisClient();
        if (redis) {
            try {
                const raw = await redis.get(REDIS_KEY);
                if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
                    const labels = (raw as string[]).map((s) => s.trim()).filter(Boolean);
                    if (labels.length > 0) {
                        memoryCache = { labels, expiresAt: Date.now() + TTL_MS };
                        return labels;
                    }
                }
                if (typeof raw === 'string' && raw.length > 0) {
                    const parsed = JSON.parse(raw) as unknown;
                    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
                        const labels = (parsed as string[]).map((s) => s.trim()).filter(Boolean);
                        if (labels.length > 0) {
                            memoryCache = { labels, expiresAt: Date.now() + TTL_MS };
                            return labels;
                        }
                    }
                }
            } catch {
                // Redis miss or parse error — load from DB
            }
        }

        const labels = loadLabelsFromConstant();
        if (labels.length > 0) {
            memoryCache = { labels, expiresAt: Date.now() + TTL_MS };
            if (redis) {
                try {
                    await redis.set(REDIS_KEY, JSON.stringify(labels), { ex: TTL_SEC });
                } catch {
                    /* non-fatal */
                }
            }
        }
        return labels;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
}
