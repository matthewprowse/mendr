// Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (optional — falls back to in-memory)

import { NextRequest, NextResponse } from 'next/server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

/**
 * Public read of active service labels; backed by Redis + DB (see service-catalog-server).
 */
export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'serviceCatalog');
    if (limited) return limited;

    try {
        const labels = await getServiceCatalogLabelsCached();
        return NextResponse.json(
            { labels },
            { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' } }
        );
    } catch {
        return NextResponse.json({ labels: [] as string[] }, { status: 500 });
    }
}
