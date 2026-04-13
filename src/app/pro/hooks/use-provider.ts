import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOpenNowFromWeekdayDescriptions } from '@/lib/open-status';
import { parseWeekdayDescriptions } from '../lib/hours';
import {
    sanitizeProfileText,
    isLowSignalProfileText,
    normalizeProfileTextForStorage,
} from '@/lib/provider-profile-clean';
import { sanitizeCustomerSummary } from '@/lib/review-summary';
import { aiConfig } from '@/lib/ai-config';

type ProviderRow = {
    id?: unknown;
    google_place_id?: unknown;
    name?: unknown;
    summary?: unknown;
    summary_long?: unknown;
    about?: unknown;
    past_work?: unknown;
    specialisations?: unknown;
    highlights?: unknown;
    key_person?: unknown;
    rating?: unknown;
    rating_count?: unknown;
    weekday_descriptions?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    phone?: unknown;
    website?: unknown;
};

const toProviderRow = (value: unknown): ProviderRow | null => {
    if (!value || typeof value !== 'object') return null;
    return value as ProviderRow;
};

export function useProProvider(placeId: string) {
    const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        );

    const [providerName, setProviderName] = useState<string | null>(null);
    const [providerAddress, setProviderAddress] = useState<string | null>(null);
    const [providerLat, setProviderLat] = useState<number | null>(null);
    const [providerLng, setProviderLng] = useState<number | null>(null);
    const [providerSummary, setProviderSummary] = useState<string | null>(null);
    const [providerSummaryLong, setProviderSummaryLong] = useState<string | null>(null);
    const [providerRating, setProviderRating] = useState<number | null>(null);
    const [providerRatingCount, setProviderRatingCount] = useState<number>(0);
    const [providerPhone, setProviderPhone] = useState<string | null>(null);
    const [providerEmail, setProviderEmail] = useState<string | null>(null);
    const [providerWebsiteRaw, setProviderWebsiteRaw] = useState<string | null>(null);
    const [isProviderLoading, setIsProviderLoading] = useState(true);
    const [isOperatingHoursLoading, setIsOperatingHoursLoading] = useState(true);
    const [operatingHoursByDay, setOperatingHoursByDay] = useState<Record<string, string>>({});
    const [showAllOperatingHours, setShowAllOperatingHours] = useState(false);
    // R11: Enrichment display fields
    const [providerSpecialisations, setProviderSpecialisations] = useState<string[]>([]);
    const [providerHighlights, setProviderHighlights] = useState<string[]>([]);
    const [providerFounder, setProviderFounder] = useState<string | null>(null);
    const lastQueuedPlaceIdRef = useRef<string>('');

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!placeId) return;
            setIsProviderLoading(true);
            setIsOperatingHoursLoading(true);
            setOperatingHoursByDay({});
            setShowAllOperatingHours(false);
            try {
                let data: ProviderRow | null = null;
                // Some deployments may lag behind schema updates; if extended fields
                // (about/past_work/summary_long) aren't present yet, Supabase/PostgREST
                // returns `400 Bad Request`. Retry with a minimal column set so the
                // page still loads.
                const selectBase =
                    'id, google_place_id, name, summary, rating, rating_count, weekday_descriptions, address, latitude, longitude, phone, website';
                const selectExtended =
                    'id, google_place_id, name, summary, summary_long, about, past_work, specialisations, highlights, key_person, rating, rating_count, weekday_descriptions, address, latitude, longitude, phone, website';

                const fetchRow = async (select: string) => {
                    if (isUuid(placeId)) {
                        const { data: row, error } = await supabase
                            .from('providers')
                            .select(select)
                            .eq('id', placeId)
                            .eq('is_active', true)
                            .maybeSingle();
                        if (error) throw error;
                        return toProviderRow(row);
                    }

                    const googlePlaceId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
                    const { data: row, error } = await supabase
                        .from('providers')
                        .select(select)
                        .eq('google_place_id', googlePlaceId)
                        .eq('is_active', true)
                        .maybeSingle();
                    if (error) throw error;
                    return toProviderRow(row);
                };

                try {
                    data = await fetchRow(selectExtended);
                } catch {
                    data = await fetchRow(selectBase).catch(() => null);
                }
                if (cancelled) return;
                if (data) {
                    const providerId =
                        typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null;
                    const googlePlaceId =
                        typeof data.google_place_id === 'string' && data.google_place_id.trim()
                            ? data.google_place_id.trim()
                            : null;
                    if (typeof data.name === 'string') setProviderName(data.name);
                    setProviderRating(
                        typeof data.rating === 'number' && Number.isFinite(data.rating)
                            ? data.rating
                            : null
                    );
                    setProviderRatingCount(
                        typeof data.rating_count === 'number' && Number.isFinite(data.rating_count)
                            ? Math.max(0, Math.trunc(data.rating_count))
                            : 0
                    );
                    setProviderAddress(
                        typeof data.address === 'string' && data.address.trim() ? data.address.trim() : null
                    );
                    const lat = data.latitude;
                    const lng = data.longitude;
                    setProviderLat(typeof lat === 'number' && Number.isFinite(lat) ? lat : null);
                    setProviderLng(typeof lng === 'number' && Number.isFinite(lng) ? lng : null);
                    const summaryRaw = typeof data.summary === 'string' ? data.summary : '';
                    const summaryLongRaw = typeof data.summary_long === 'string' ? data.summary_long : '';
                    const aboutRaw = typeof data.about === 'string' ? data.about : '';
                    const pastWorkRaw = typeof data.past_work === 'string' ? data.past_work : '';

                    const summary = sanitizeCustomerSummary(sanitizeProfileText(summaryRaw));
                    const long =
                        summaryLongRaw.trim()
                            ? sanitizeProfileText(summaryLongRaw)
                            : '';
                    const about = aboutRaw.trim() ? sanitizeProfileText(aboutRaw) : '';
                    const past = pastWorkRaw.trim() ? sanitizeProfileText(pastWorkRaw) : '';
                    const longCandidate = long || [about, past].filter(Boolean).join('\n\n');
                    const longIsLowSignal = isLowSignalProfileText(longCandidate);
                    const summaryIsLowSignal = isLowSignalProfileText(summary);
                    const composed =
                        (!longIsLowSignal && longCandidate) ||
                        (!summaryIsLowSignal && summary) ||
                        null;

                    setProviderSummary(summaryIsLowSignal ? null : summary);
                    setProviderSummaryLong(composed);

                    const summaryForStorage = normalizeProfileTextForStorage(summaryRaw);
                    const summaryLongForStorage = normalizeProfileTextForStorage(summaryLongRaw);
                    const aboutForStorage = normalizeProfileTextForStorage(aboutRaw);
                    const pastWorkForStorage = normalizeProfileTextForStorage(pastWorkRaw);

                    const needsBackendCleanup =
                        (summaryRaw.trim() || null) !== summaryForStorage ||
                        (summaryLongRaw.trim() || null) !== summaryLongForStorage ||
                        (aboutRaw.trim() || null) !== aboutForStorage ||
                        (pastWorkRaw.trim() || null) !== pastWorkForStorage;

                    if (needsBackendCleanup && (providerId || googlePlaceId)) {
                        // Best-effort write-back so noisy scraped content is repaired in the DB too.
                        void fetch('/api/providers/clean-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ providerId, googlePlaceId }),
                        }).catch(() => {
                            // Ignore cleanup failures; UI already shows sanitized text.
                        });
                    }
                    setProviderPhone(
                        typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null
                    );
                    setProviderEmail(null);
                    setProviderWebsiteRaw(
                        typeof data.website === 'string' && data.website.trim() ? data.website.trim() : null
                    );
                    setOperatingHoursByDay(parseWeekdayDescriptions(data.weekday_descriptions));
                    setShowAllOperatingHours(false);
                    // R11: Enrichment display fields
                    setProviderSpecialisations(Array.isArray(data.specialisations) ? (data.specialisations as string[]) : []);
                    setProviderHighlights(Array.isArray(data.highlights) ? (data.highlights as string[]) : []);
                    setProviderFounder(typeof data.key_person === 'string' && data.key_person.trim() ? data.key_person.trim() : null);
                    const queuePlaceId = googlePlaceId
                        ?? (isUuid(placeId) ? null : (placeId.startsWith('places/') ? placeId : `places/${placeId}`));
                    if (queuePlaceId && lastQueuedPlaceIdRef.current !== queuePlaceId) {
                        lastQueuedPlaceIdRef.current = queuePlaceId;
                        // Load cached data immediately from providers, then refresh enrichment in background.
                        // Full scrape + images + combined AI (not match’s fast review-summary-only path).
                        void fetch('/api/enrich/queue', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                placeIds: [queuePlaceId],
                                priorityPlaceId: queuePlaceId,
                                mode: 'full',
                                cacheVersion: aiConfig.providerEnrichmentCacheVersion,
                            }),
                        }).catch(() => undefined);
                    }
                } else {
                    setProviderName(null);
                    setProviderAddress(null);
                    setProviderLat(null);
                    setProviderLng(null);
                    setProviderSummary(null);
                    setProviderSummaryLong(null);
                    setProviderRating(null);
                    setProviderRatingCount(0);
                    setProviderPhone(null);
                    setProviderEmail(null);
                    setProviderWebsiteRaw(null);
                    setProviderSpecialisations([]);
                    setProviderHighlights([]);
                    setProviderFounder(null);
                }
            } catch {
                // ignore
            } finally {
                if (!cancelled) {
                    setIsOperatingHoursLoading(false);
                    setIsProviderLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const providerIsOpen = useMemo(() => {
        const weekdayDescriptions = Object.entries(operatingHoursByDay).map(
            ([day, hours]) => `${day}: ${hours}`
        );
        return weekdayDescriptions.length
            ? isOpenNowFromWeekdayDescriptions(weekdayDescriptions, new Date())
            : null;
    }, [operatingHoursByDay]);

    return {
        providerName,
        providerAddress,
        providerLat,
        providerLng,
        providerSummary,
        providerSummaryLong,
        providerRating,
        providerRatingCount,
        providerPhone,
        providerEmail,
        providerWebsiteRaw,
        isProviderLoading,
        isOperatingHoursLoading,
        operatingHoursByDay,
        showAllOperatingHours,
        setShowAllOperatingHours,
        providerIsOpen,
        // R11: Enrichment display fields
        providerSpecialisations,
        providerHighlights,
        providerFounder,
    };
}
