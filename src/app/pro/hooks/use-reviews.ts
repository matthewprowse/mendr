import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/auth/supabase';
import { REVIEWS_PAGE_SIZE, GOOGLE_REVIEWS_MAX_DISPLAY } from '../lib/constants';
import { formatReviewDateLabel, getInitials } from '../lib/review-formatters';
import type { CategoryKey, ReviewCard } from '../lib/types';

export function useProReviews(placeId: string) {
    const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        );
    const [googleReviews, setGoogleReviews] = useState<any[]>([]);
    const [mendrReviews, setMendrReviews] = useState<any[]>([]);
    const [isReviewsLoading, setIsReviewsLoading] = useState(false);
    const [resolvedProviderId, setResolvedProviderId] = useState<string | null>(null);
    const [providerGooglePlaceId, setProviderGooglePlaceId] = useState<string | null>(null);
    const [googleReviewTotalFromGoogle, setGoogleReviewTotalFromGoogle] = useState(0);
    const [mendrReviewTotalFromMendr, setMendrReviewTotalFromMendr] = useState(0);
    const [googleReviewsVisibleCount, setGoogleReviewsVisibleCount] = useState(REVIEWS_PAGE_SIZE);
    const [mendrReviewsVisibleCount, setMendrReviewsVisibleCount] = useState(REVIEWS_PAGE_SIZE);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!placeId) return;
            setIsReviewsLoading(true);
            setGoogleReviews([]);
            setMendrReviews([]);
            setResolvedProviderId(null);
            setProviderGooglePlaceId(null);
            setGoogleReviewTotalFromGoogle(0);
            setMendrReviewTotalFromMendr(0);
            try {
                let providerId: string | null = null;
                if (isUuid(placeId)) {
                    const { data: providerRow } = await (supabase as any)
                        .from('providers')
                        .select('id, google_place_id, rating_count')
                        .eq('id', placeId)
                        .maybeSingle();
                    providerId = providerRow?.id ? String(providerRow.id) : placeId;
                    if (cancelled) return;
                    setResolvedProviderId(providerId);
                    setProviderGooglePlaceId(
                        providerRow?.google_place_id ? String(providerRow.google_place_id) : null
                    );
                    setGoogleReviewTotalFromGoogle(
                        typeof providerRow?.rating_count === 'number' ? providerRow.rating_count : 0
                    );
                } else {
                    const googlePlaceId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
                    const { data: providerRow } = await (supabase as any)
                        .from('providers')
                        .select('id, google_place_id, rating_count')
                        .eq('google_place_id', googlePlaceId)
                        .eq('is_active', true)
                        .maybeSingle();
                    providerId = providerRow?.id ? String(providerRow.id) : null;
                    if (cancelled) return;
                    setResolvedProviderId(providerId);
                    setProviderGooglePlaceId(
                        providerRow?.google_place_id ? String(providerRow.google_place_id) : null
                    );
                    setGoogleReviewTotalFromGoogle(
                        typeof providerRow?.rating_count === 'number' ? providerRow.rating_count : 0
                    );
                }
                if (!providerId) return;

                const mendrCountRes = await (supabase as any)
                    .from('reviews')
                    .select('id', { count: 'exact', head: true })
                    .eq('provider_id', providerId)
                    .eq('source', 'mendr')
                    .eq('status', 'approved');
                if (!cancelled) setMendrReviewTotalFromMendr(mendrCountRes.count ?? 0);

                const googleRes = await (supabase as any)
                    .from('reviews')
                    .select('*')
                    .eq('provider_id', providerId)
                    .eq('status', 'approved')
                    .eq('source', 'google')
                    .order('published_at', { ascending: false })
                    .limit(GOOGLE_REVIEWS_MAX_DISPLAY);

                const batch = 500;
                const mendrAccum: any[] = [];
                for (let offset = 0; ; offset += batch) {
                    const mendrRes = await (supabase as any)
                        .from('reviews')
                        .select('*')
                        .eq('provider_id', providerId)
                        .eq('status', 'approved')
                        .eq('source', 'mendr')
                        .order('published_at', { ascending: false })
                        .range(offset, offset + batch - 1);
                    if (cancelled) return;
                    const chunk = Array.isArray(mendrRes.data) ? mendrRes.data : [];
                    mendrAccum.push(...chunk);
                    if (chunk.length < batch) break;
                }

                if (cancelled) return;
                const gData =
                    !googleRes.error && Array.isArray(googleRes.data) ? googleRes.data : [];
                setGoogleReviews(gData);
                setMendrReviews(mendrAccum);
                if (!cancelled) {
                    setGoogleReviewsVisibleCount(Math.min(GOOGLE_REVIEWS_MAX_DISPLAY, gData.length));
                    setMendrReviewsVisibleCount(mendrAccum.length);
                }
            } catch {
                // keep page usable
            } finally {
                if (!cancelled) setIsReviewsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    useEffect(() => {
        setGoogleReviewsVisibleCount(GOOGLE_REVIEWS_MAX_DISPLAY);
        setMendrReviewsVisibleCount(REVIEWS_PAGE_SIZE);
    }, [placeId]);

    const googleReviewCards: ReviewCard[] = useMemo(
        () =>
            googleReviews.map((r: any) => {
                const fullName =
                    typeof r?.reviewer_name === 'string' && r.reviewer_name.trim()
                        ? r.reviewer_name.trim()
                        : 'Google review';
                return {
                    id: String(r.id),
                    fullName,
                    initials: getInitials(fullName),
                    rating: typeof r?.rating === 'number' ? r.rating : null,
                    sentAt: formatReviewDateLabel(r?.published_at) || r?.relative_publish_time_description || '—',
                    body: typeof r?.body === 'string' ? r.body : '',
                };
            }),
        [googleReviews]
    );

    const mendrReviewCards: ReviewCard[] = useMemo(
        () =>
            mendrReviews.map((r: any) => {
                const fullName =
                    typeof r?.reviewer_name === 'string' && r.reviewer_name.trim()
                        ? r.reviewer_name.trim()
                        : 'Mendr review';
                return {
                    id: String(r.id),
                    fullName,
                    initials: getInitials(fullName),
                    rating: typeof r?.rating === 'number' ? r.rating : null,
                    sentAt: formatReviewDateLabel(r?.published_at) || r?.relative_publish_time_description || '—',
                    body: typeof r?.body === 'string' ? r.body : '',
                    title: typeof r?.title === 'string' ? r.title.trim() : '',
                };
            }),
        [mendrReviews]
    );

    const googleReviewsShown = useMemo(
        () => googleReviewCards.slice(0, googleReviewsVisibleCount),
        [googleReviewCards, googleReviewsVisibleCount]
    );
    const mendrReviewsShown = useMemo(
        () => mendrReviewCards.slice(0, mendrReviewsVisibleCount),
        [mendrReviewCards, mendrReviewsVisibleCount]
    );

    const mendrCategoryAggregates = useMemo(() => {
        const keys = ['punctuality', 'cleanliness', 'work_quality', 'quote_accuracy'] as const;
        const sums = { punctuality: 0, cleanliness: 0, work_quality: 0, quote_accuracy: 0 };
        const counts = { punctuality: 0, cleanliness: 0, work_quality: 0, quote_accuracy: 0 };
        for (const r of mendrReviews) {
            const cr = r?.category_ratings;
            if (!cr || typeof cr !== 'object') continue;
            const o = cr as Record<string, unknown>;
            for (const k of keys) {
                const v = o[k];
                if (typeof v === 'number' && Number.isFinite(v)) {
                    sums[k] += v;
                    counts[k] += 1;
                }
            }
        }
        return {
            punctuality: counts.punctuality > 0 ? sums.punctuality / counts.punctuality : null,
            cleanliness: counts.cleanliness > 0 ? sums.cleanliness / counts.cleanliness : null,
            work_quality: counts.work_quality > 0 ? sums.work_quality / counts.work_quality : null,
            quote_accuracy: counts.quote_accuracy > 0 ? sums.quote_accuracy / counts.quote_accuracy : null,
        } as Record<CategoryKey, number | null>;
    }, [mendrReviews]);

    const submitReview = useCallback(
        async (params: {
            reviewerName: string;
            reviewTitle: string;
            reviewBody: string;
            categoryRatings: Record<CategoryKey, number>;
        }) => {
            if (!resolvedProviderId) return { ok: false as const, error: 'Provider not loaded.' };
            if (!params.reviewerName.trim()) return { ok: false as const, error: 'Please enter your name.' };
            if (!params.reviewBody.trim()) return { ok: false as const, error: 'Please write your review.' };

            try {
                const res = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        providerId: resolvedProviderId,
                        reviewerName: params.reviewerName.trim(),
                        reviewTitle: params.reviewTitle.trim() || undefined,
                        reviewBody: params.reviewBody.trim(),
                        categoryRatings: params.categoryRatings,
                    }),
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) {
                    return {
                        ok: false as const,
                        error: typeof data?.error === 'string' ? data.error : 'Failed to submit',
                    };
                }
                const batch = 500;
                const mendrAccum: any[] = [];
                for (let offset = 0; ; offset += batch) {
                    const mendrRes = await (supabase as any)
                        .from('reviews')
                        .select('*')
                        .eq('provider_id', resolvedProviderId)
                        .eq('status', 'approved')
                        .eq('source', 'mendr')
                        .order('published_at', { ascending: false })
                        .range(offset, offset + batch - 1);
                    const chunk = Array.isArray(mendrRes.data) ? mendrRes.data : [];
                    mendrAccum.push(...chunk);
                    if (chunk.length < batch) break;
                }
                setMendrReviews(mendrAccum);
                setMendrReviewsVisibleCount(mendrAccum.length);
                const mendrCountRes = await (supabase as any)
                    .from('reviews')
                    .select('id', { count: 'exact', head: true })
                    .eq('provider_id', resolvedProviderId)
                    .eq('source', 'mendr')
                    .eq('status', 'approved');
                setMendrReviewTotalFromMendr(mendrCountRes.count ?? mendrAccum.length);
                return { ok: true as const };
            } catch {
                return { ok: false as const, error: 'Network error' };
            }
        },
        [resolvedProviderId]
    );

    return {
        isReviewsLoading,
        resolvedProviderId,
        providerGooglePlaceId,
        googleReviewTotalFromGoogle,
        mendrReviewTotalFromMendr,
        googleReviewCards,
        mendrReviewCards,
        googleReviewsShown,
        mendrReviewsShown,
        googleReviewsVisibleCount,
        mendrReviewsVisibleCount,
        setGoogleReviewsVisibleCount,
        setMendrReviewsVisibleCount,
        mendrCategoryAggregates,
        submitReview,
    };
}
