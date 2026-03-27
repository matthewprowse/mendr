import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { refreshProviderByPlaceId } from '@/lib/refresh-provider-by-place-id';
import { checkRateLimit } from '@/lib/rate-limit-config';

/**
 * POST /api/providers/[id]/sync-google-gallery
 * If this provider has no rows in `provider_images`, fetches the place from Google Places,
 * downloads photo media, uploads to the `gallery` bucket, and upserts `provider_images`.
 * Uses `refreshProviderByPlaceId` (same path as pro profile backfill).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = checkRateLimit(req, 'syncGallery');
    if (limited) return limited;
    try {
        const { id: providerId } = await params;
        if (!providerId) {
            return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
        }

        const admin = await createSupabaseAdminClient();

        // Only pull from Google when this provider has no Google-sourced rows yet (pending Scandio uploads don't block this).
        const { count, error: countErr } = await admin
            .from('provider_images')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .eq('source', 'google');

        if (countErr) {
            console.error('sync-google-gallery count:', countErr.message);
            return NextResponse.json({ error: 'Failed to check gallery' }, { status: 500 });
        }

        if ((count ?? 0) > 0) {
            return NextResponse.json({ ok: true, skipped: true, reason: 'already_has_google_images' });
        }

        const { data: provider, error: provErr } = await admin
            .from('providers')
            .select('google_place_id')
            .eq('id', providerId)
            .maybeSingle();

        if (provErr || !provider?.google_place_id) {
            return NextResponse.json(
                { error: 'Provider has no Google place id; cannot sync photos' },
                { status: 400 }
            );
        }

        const rawPlaceId = String(provider.google_place_id).replace(/^places\//, '');
        const result = await refreshProviderByPlaceId(rawPlaceId);

        if (!result.ok) {
            return NextResponse.json({ error: result.error || 'Refresh failed' }, { status: 502 });
        }

        return NextResponse.json({ ok: true, synced: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
