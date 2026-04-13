import { NextResponse } from 'next/server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';

/**
 * Public read of active service labels; backed by Redis + DB (see service-catalog-server).
 */
export async function GET() {
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
