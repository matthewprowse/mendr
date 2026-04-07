import type {
    GeocodeRequest,
    GeocodeResponse,
    ProvidersRequest,
    ProvidersResponse,
} from '../contracts';
import type { EnrichmentCacheEntry } from '@/app/api/enrich/get/route';
import { toGooglePlaceId } from '@/app/api/providers/persistence';

function normalizePlaceIds(placeIds: string[]): string[] {
    return placeIds
        .filter((id) => typeof id === 'string' && id.trim())
        .map((id) => toGooglePlaceId(id.trim()));
}

export type FetchProvidersApiResult = {
    ok: boolean;
    status: number;
    data: ProvidersResponse | null;
};

const providersPrewarmCache = new Map<string, number>();
const providersPrewarmInFlight = new Map<string, Promise<void>>();
const PROVIDERS_PREWARM_TTL_MS = 45_000;

function providersPrewarmKey(payload: ProvidersRequest): string {
    return [
        payload.lat.toFixed(6),
        payload.lng.toFixed(6),
        payload.trade.trim().toLowerCase(),
        (payload.tradeDetail ?? '').trim().toLowerCase(),
        String(payload.radius ?? 10_000),
    ].join('|');
}

export async function fetchProvidersApi(
    payload: ProvidersRequest,
    options?: { signal?: AbortSignal }
): Promise<FetchProvidersApiResult> {
    const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options?.signal,
    });
    const data = (await res.json().catch(() => null)) as ProvidersResponse | null;
    return { ok: res.ok, status: res.status, data };
}

export async function prewarmProvidersApi(payload: ProvidersRequest): Promise<void> {
    const key = providersPrewarmKey(payload);
    const now = Date.now();
    const cachedUntil = providersPrewarmCache.get(key) ?? 0;
    if (cachedUntil > now) return;

    const existing = providersPrewarmInFlight.get(key);
    if (existing) return existing;

    const run = fetchProvidersApi(payload)
        .then(() => {
            providersPrewarmCache.set(key, Date.now() + PROVIDERS_PREWARM_TTL_MS);
        })
        .catch(() => undefined)
        .finally(() => {
            providersPrewarmInFlight.delete(key);
        });

    providersPrewarmInFlight.set(key, run);
    return run;
}

const geocodeLatLngCache = new Map<string, GeocodeResponse | null>();

function geocodeCacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function geocodeApi(payload: GeocodeRequest): Promise<GeocodeResponse | null> {
    if (
        typeof payload.lat === 'number' &&
        typeof payload.lng === 'number' &&
        !Number.isNaN(payload.lat) &&
        !Number.isNaN(payload.lng)
    ) {
        const key = geocodeCacheKey(payload.lat, payload.lng);
        if (geocodeLatLngCache.has(key)) {
            return geocodeLatLngCache.get(key) ?? null;
        }
        const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => null);
        if (!res) {
            geocodeLatLngCache.set(key, null);
            return null;
        }
        const data = (await res.json().catch(() => null)) as GeocodeResponse | null;
        geocodeLatLngCache.set(key, data);
        return data;
    }

    const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) return null;
    return (await res.json().catch(() => null)) as GeocodeResponse | null;
}

export async function queueEnrichmentApi(
    placeIds: string[],
    trade?: string,
    options?: { priorityPlaceId?: string }
): Promise<void> {
    const normalized = normalizePlaceIds(placeIds);
    if (normalized.length === 0) return;
    const priorityPlaceId = options?.priorityPlaceId
        ? toGooglePlaceId(options.priorityPlaceId)
        : undefined;
    fetch('/api/enrich/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds: normalized, trade, priorityPlaceId }),
    }).catch(() => undefined);
}

export async function fetchEnrichmentApi(
    placeIds: string[]
): Promise<Record<string, EnrichmentCacheEntry> | null> {
    const normalized = normalizePlaceIds(placeIds);
    if (normalized.length === 0) return null;
    const res = await fetch('/api/enrich/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds: normalized }),
    }).catch(() => null);
    if (!res?.ok) return null;
    const data = await res.json().catch(() => null) as { cache?: Record<string, EnrichmentCacheEntry> } | null;
    return data?.cache ?? null;
}

export async function reviewsCountApi(providerId: string): Promise<{
    scandioReviewCount: number;
    googleReviewCount: number;
} | null> {
    const res = await fetch('/api/reviews-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
    }).catch(() => null);
    if (!res) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    return {
        scandioReviewCount:
            typeof data.scandioReviewCount === 'number' ? data.scandioReviewCount : 0,
        googleReviewCount: typeof data.googleReviewCount === 'number' ? data.googleReviewCount : 0,
    };
}

export async function restoreProviderTokenApi(payload: {
    providerId: string;
    conversationId: string;
    channel: 'phone' | 'email' | 'whatsapp';
}): Promise<void> {
    await fetch('/api/providers/restore-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => undefined);
}
