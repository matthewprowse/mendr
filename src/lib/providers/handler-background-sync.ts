/**
 * Fire-and-forget background persistence for /api/providers. Extracted from
 * `handler.ts` in Phase 2.
 *
 * Upserts returned providers into the `providers` table, then fetches Google
 * reviews for any provider whose review sync is stale or absent, deduplicates
 * + persists them, stamps `reviews_synced_at`, and enforces the 24-month /
 * 50-review retention cap.
 *
 * Behaviour preserved verbatim — the call is `void`-ed by the route so it
 * never blocks the response.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { formatBusinessName } from '@/lib/utils';
import { formatWeekdayDescriptionsTo24h } from './format-weekday-descriptions';
import { fetchPlaceReviewsFromGoogle } from './google-place-reviews';
import { normalizePlaceId } from './place-id';
import { toGooglePlaceId } from './persistence';
import { TWENTY_FOUR_MONTHS_MS, REVIEW_SYNC_TTL_MS } from './constants';
import type { ProviderItem } from './contracts';

export interface BackgroundSyncParams {
    limitedProviders: ProviderItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: any[];
    apiKey: string;
}

export function scheduleProvidersBackgroundSync(
    params: BackgroundSyncParams,
): void {
    const { limitedProviders, places, apiKey } = params;
    if (limitedProviders.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeById = new Map<string, any>();
    for (const pl of places || []) {
        const pid = normalizePlaceId(pl?.id || '');
        if (pid) placeById.set(pid, pl);
    }

    void (async () => {
        try {
            const adminSupabase = await createSupabaseAdminClient();
            const nowIso = new Date().toISOString();
            const rows = limitedProviders.map((p) => {
                const googlePlaceId =
                    typeof p.placeId === 'string' && p.placeId.startsWith('places/')
                        ? p.placeId
                        : `places/${p.placeId}`;
                const openingHours = (p as { weekdayDescriptions?: string[] })
                    .weekdayDescriptions;
                const hoursArray = formatWeekdayDescriptionsTo24h(openingHours) ?? [];

                return {
                    source: 'google',
                    google_place_id: googlePlaceId,
                    name: formatBusinessName(p.name) || p.name,
                    address: p.address,
                    rating: p.rating,
                    rating_count: p.ratingCount ?? 0,
                    phone: p.phone,
                    website: p.website,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    summary: p.summary ?? '',
                    weekday_descriptions: hoursArray.length > 0 ? hoursArray : null,
                    last_updated: nowIso,
                    updated_at: nowIso,
                };
            });

            const upsertRes = await adminSupabase
                .from('providers')
                .upsert(rows, { onConflict: 'google_place_id' });
            if (upsertRes.error) return upsertRes;

            const googleIds = rows.map((r) => r.google_place_id).filter(Boolean);
            const { data: providerRows, error: provErr } = await adminSupabase
                .from('providers')
                .select('id, google_place_id, reviews_synced_at')
                .eq('is_active', true)
                .in('google_place_id', googleIds);
            if (provErr) {
                console.warn('Reviews upsert skipped:', provErr.message);
                return upsertRes;
            }
            const providerIdByGoogle = new Map<string, string>(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (providerRows || []).map((r: any) => [
                    String(r.google_place_id),
                    String(r.id),
                ]),
            );
            const reviewSyncedAtByGoogleId = new Map<string, string | null>(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (providerRows || []).map((r: any) => [
                    String(r.google_place_id),
                    r.reviews_synced_at ?? null,
                ]),
            );

            // Surface internal `providerId` on the response objects.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (limitedProviders as any[]).forEach((p: any) => {
                const rawPid = p?.placeId || p?.place_id;
                if (typeof rawPid !== 'string') return;
                const googlePlaceId = toGooglePlaceId(rawPid);
                const providerId = providerIdByGoogle.get(googlePlaceId);
                if (providerId) p.providerId = providerId;
            });

            // Background website enrichment for first ingestion.
            {
                const toEnrich = rows
                    .filter((r) => r.website && !r.summary)
                    .slice(0, 2)
                    .map((r) => providerIdByGoogle.get(r.google_place_id))
                    .filter(Boolean) as string[];

                if (toEnrich.length > 0) {
                    import('./refresh-provider-website')
                        .then(async ({ refreshProviderWebsiteById }) => {
                            for (const pid of toEnrich) {
                                await refreshProviderWebsiteById(pid).catch(() => {});
                            }
                        })
                        .catch(() => {});
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reviewPayload: any[] = [];
            const cutoffMs = Date.now() - TWENTY_FOUR_MONTHS_MS;

            for (const googlePlaceId of googleIds) {
                const providerId = providerIdByGoogle.get(googlePlaceId);
                if (!providerId) continue;
                const pl = placeById.get(normalizePlaceId(googlePlaceId));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let revs = (pl?.reviews || []) as any[];
                const syncedAt = reviewSyncedAtByGoogleId.get(googlePlaceId);
                const isReviewStale =
                    !syncedAt ||
                    Date.now() - new Date(syncedAt).getTime() > REVIEW_SYNC_TTL_MS;
                if (!Array.isArray(revs) || revs.length === 0 || isReviewStale) {
                    const freshRevs = await fetchPlaceReviewsFromGoogle(
                        googlePlaceId,
                        apiKey,
                    );
                    if (freshRevs.length > 0) revs = freshRevs;
                }
                for (const rev of revs) {
                    const publishTime = rev?.publishTime
                        ? new Date(rev.publishTime).getTime()
                        : null;
                    if (publishTime && publishTime < cutoffMs) continue;

                    const sourceRef =
                        rev?.name ||
                        `${googlePlaceId}:${rev?.publishTime || rev?.relativePublishTimeDescription || ''}:${rev?.authorAttribution?.displayName || rev?.authorAttribution?.name || ''}`;
                    const rawBody =
                        (typeof rev?.originalText?.text === 'string' && rev.originalText.text) ||
                        (typeof rev?.text?.text === 'string' && rev.text.text) ||
                        (typeof rev?.text === 'string' && rev.text) ||
                        '';
                    const originalBody = String(rawBody || '').trim();
                    if (!originalBody) continue;

                    const originalName =
                        (rev?.authorAttribution?.displayName as string) ||
                        (rev?.authorAttribution?.name as string) ||
                        null;

                    reviewPayload.push({
                        provider_id: providerId,
                        source: 'google',
                        source_ref: String(sourceRef || '').slice(0, 512),
                        status: 'approved',
                        reviewer_name: originalName,
                        rating: typeof rev?.rating === 'number' ? rev.rating : null,
                        body: originalBody,
                        relative_publish_time_description:
                            rev?.relativePublishTimeDescription || null,
                        published_at: rev?.publishTime || null,
                        raw: rev ?? null,
                        updated_at: nowIso,
                    });
                }
            }

            if (reviewPayload.length > 0) {
                const { error: reviewsErr } = await adminSupabase
                    .from('reviews')
                    .upsert(reviewPayload, {
                        onConflict: 'provider_id,source,source_ref',
                    });
                if (reviewsErr) {
                    console.warn('Reviews upsert skipped:', reviewsErr.message);
                }

                const syncedProviderIds = Array.from(
                    new Set(reviewPayload.map((r) => r.provider_id)),
                );
                if (syncedProviderIds.length > 0) {
                    try {
                        await adminSupabase
                            .from('providers')
                            .update({ reviews_synced_at: nowIso })
                            .in('id', syncedProviderIds);
                    } catch {
                        // ignore — reviews are already stored
                    }
                }

                // Enforce 24-month window & 50-review cap.
                const cutoffIso = new Date(cutoffMs).toISOString();
                const { data: affectedProviders } = await adminSupabase
                    .from('reviews')
                    .select('provider_id')
                    .eq('source', 'google')
                    .in(
                        'provider_id',
                        Array.from(new Set(reviewPayload.map((r) => r.provider_id))),
                    );

                const uniqueProviderIds = Array.from(
                    new Set(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (affectedProviders || []).map((r: any) => r.provider_id),
                    ),
                );

                for (const pid of uniqueProviderIds) {
                    await adminSupabase
                        .from('reviews')
                        .delete()
                        .eq('provider_id', pid)
                        .eq('source', 'google')
                        .lt('published_at', cutoffIso);

                    const { data: recentRows } = await adminSupabase
                        .from('reviews')
                        .select('id, published_at')
                        .eq('provider_id', pid)
                        .eq('source', 'google')
                        .order('published_at', { ascending: false })
                        .limit(60);

                    if (recentRows && recentRows.length > 50) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const idsToDelete = recentRows.slice(50).map((r: any) => r.id);
                        if (idsToDelete.length > 0) {
                            await adminSupabase
                                .from('reviews')
                                .delete()
                                .in('id', idsToDelete);
                        }
                    }
                }
            }

            return upsertRes;
        } catch (err) {
            console.error('[providers] background sync error:', err);
        }
    })();
}
