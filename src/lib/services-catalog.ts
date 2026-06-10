import { SERVICE_LABELS } from '@/lib/services';

let clientCatalogCache: { labels: string[]; expiresAt: number } | null = null;
let clientCatalogInFlight: Promise<string[]> | null = null;

const CLIENT_CATALOG_TTL_MS = 5 * 60 * 1000;

export async function fetchActiveServiceCatalogClient(
    // supabase param kept for call-site compatibility — no longer used
    _supabase?: unknown
): Promise<string[]> {
    const now = Date.now();
    if (clientCatalogCache && now < clientCatalogCache.expiresAt) {
        return clientCatalogCache.labels;
    }
    if (clientCatalogInFlight) return clientCatalogInFlight;

    clientCatalogInFlight = (async () => {
        // Try the API route first (backed by Redis + in-memory cache server-side).
        if (typeof window !== 'undefined') {
            try {
                const res = await fetch('/api/service-catalog', { credentials: 'same-origin' });
                if (res.ok) {
                    const body = (await res.json()) as { labels?: unknown };
                    const raw = body?.labels;
                    if (Array.isArray(raw)) {
                        const labels = raw
                            .map((x) => (typeof x === 'string' ? x.trim() : ''))
                            .filter((s) => s.length > 0);
                        if (labels.length > 0) {
                            clientCatalogCache = { labels, expiresAt: Date.now() + CLIENT_CATALOG_TTL_MS };
                            return labels;
                        }
                    }
                }
            } catch {
                // Fall through to static fallback.
            }
        }

        // Final fallback: use the canonical TypeScript constant.
        // The `services` DB table was removed — SERVICE_LABELS is the source of truth.
        const labels = [...SERVICE_LABELS];
        clientCatalogCache = { labels, expiresAt: Date.now() + CLIENT_CATALOG_TTL_MS };
        return labels;
    })();

    try {
        return await clientCatalogInFlight;
    } finally {
        clientCatalogInFlight = null;
    }
}
