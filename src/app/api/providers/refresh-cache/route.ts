import { NextRequest, NextResponse } from 'next/server';
import { refreshCachedProvider } from '@/lib/refresh-provider-cache';

function normalizePlaceId(id: string): string {
    return (id || '').replace(/^places\//, '').trim();
}

/**
 * POST /api/providers/refresh-cache
 * Body: { place_id: string }
 * Refreshes a single cached provider from Google Place Details (reviews, opening hours, etc.).
 * Used by the sync-provider-reviews script.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const placeId = body?.place_id ?? body?.placeId ?? '';
        const id = normalizePlaceId(placeId);
        if (!id) {
            return NextResponse.json(
                { error: 'Missing place_id in body' },
                { status: 400 }
            );
        }
        const withPrefix = id.startsWith('places/') ? id : `places/${id}`;
        const result = await refreshCachedProvider(withPrefix);
        return NextResponse.json({
            ok: result.ok,
            place_id: withPrefix,
            reviews_count: result.reviews.length,
        });
    } catch (e) {
        console.error('refresh-cache error:', e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Refresh failed' },
            { status: 500 }
        );
    }
}
