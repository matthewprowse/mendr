let clientCatalogCache: { labels: string[]; expiresAt: number } | null = null;
let clientCatalogInFlight: Promise<string[]> | null = null;

const CLIENT_CATALOG_TTL_MS = 5 * 60 * 1000;

function normalizeLabels(rows: unknown): string[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object') return '';
            return String((row as { label?: unknown }).label ?? '').trim();
        })
        .filter((label) => label.length > 0);
}

export async function fetchActiveServiceCatalogClient(
    supabase: {
        from: (table: string) => {
            select: (columns: string) => {
                eq: (column: string, value: unknown) => {
                    order: (
                        column: string,
                        options: { ascending: boolean }
                    ) => Promise<{ data: unknown }>;
                };
            };
        };
    }
): Promise<string[]> {
    const now = Date.now();
    if (clientCatalogCache && now < clientCatalogCache.expiresAt) {
        return clientCatalogCache.labels;
    }
    if (clientCatalogInFlight) return clientCatalogInFlight;

    clientCatalogInFlight = (async () => {
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
                            clientCatalogCache = {
                                labels,
                                expiresAt: Date.now() + CLIENT_CATALOG_TTL_MS,
                            };
                            return labels;
                        }
                    }
                }
            } catch {
                // Fall back to Supabase (RLS allows public read of services).
            }
        }

        const { data } = await supabase
            .from('services')
            .select('label')
            .eq('active', true)
            .order('sort_order', { ascending: true });
        const labels = normalizeLabels(data);
        if (labels.length > 0) {
            clientCatalogCache = {
                labels,
                expiresAt: Date.now() + CLIENT_CATALOG_TTL_MS,
            };
        }
        return labels;
    })();

    try {
        return await clientCatalogInFlight;
    } finally {
        clientCatalogInFlight = null;
    }
}
