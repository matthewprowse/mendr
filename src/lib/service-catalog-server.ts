import { Redis } from '@upstash/redis';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

const REDIS_KEY = 'scandio:service_catalog:active_labels_v1';
const TTL_SEC = 300;
const TTL_MS = TTL_SEC * 1000;

let memoryCache: { labels: string[]; expiresAt: number } | null = null;
let inFlight: Promise<string[]> | null = null;

/**
 * Returns labels exactly as stored in Supabase — no mapping or expansion.
 * Supabase is the single source of truth for service label names.
 */
function normalizeLabels(rows: unknown): string[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object') return '';
            return String((row as { label?: unknown }).label ?? '').trim();
        })
        .filter((label) => label.length > 0);
}

async function loadLabelsFromDatabase(): Promise<string[]> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('services')
        .select('label')
        .eq('active', true)
        .order('sort_order', { ascending: true });
    return normalizeLabels(data);
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

        const labels = await loadLabelsFromDatabase();
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
