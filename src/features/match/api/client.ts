import type {
    GeocodeRequest,
    GeocodeResponse,
    ProvidersRequest,
    ProvidersResponse,
} from '../contracts';
import type { EnrichmentCacheEntry } from '@/features/match/contracts';
import { toGooglePlaceId } from '@/lib/providers/persistence';
import { aiConfig } from '@/lib/ai/ai-config';

const ENRICH_PROVIDER_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Server routes cap place IDs per request; chunk client-side so large match lists still enrich. */
const ENRICH_PLACE_ID_BATCH = 28;

/** Dedupe concurrent identical enrich/get calls (e.g. effect overlap). */
const enrichGetInFlight = new Map<string, Promise<Record<string, EnrichmentCacheEntry> | null>>();

function enrichGetDedupeKey(placeIds: string[], providerAligned: string[]): string {
    return `${placeIds.join('\0')}\n${providerAligned.join('\0')}`;
}

function chunkPlaceIds(placeIds: string[], size: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < placeIds.length; i += size) {
        out.push(placeIds.slice(i, i + size));
    }
    return out;
}

export async function queueEnrichmentApi(
    placeIds: string[],
    trade?: string,
    options?: { priorityPlaceId?: string; providerIds?: string[] }
): Promise<void> {
    const normalized = normalizePlaceIds(placeIds);
    const providerIds = (options?.providerIds ?? [])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean);
    if (normalized.length === 0 && providerIds.length === 0) return;
    const priorityPlaceId = options?.priorityPlaceId
        ? toGooglePlaceId(options.priorityPlaceId)
        : undefined;

    const runBatch = async (
        placeChunk: string[],
        providerSlice: string[] | undefined
    ): Promise<void> => {
        const res = await fetch('/api/enrich/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                placeIds: placeChunk,
                ...(providerSlice && providerSlice.length > 0 ? { providerIds: providerSlice } : {}),
                trade,
                priorityPlaceId,
                mode: 'summary_fast',
                cacheVersion: aiConfig.providerEnrichmentCacheVersion,
            }),
        }).catch(() => null);
        if (res) await res.json().catch(() => null);
    };

    if (normalized.length === 0) {
        for (const pChunk of chunkPlaceIds(providerIds, ENRICH_PLACE_ID_BATCH)) {
            await runBatch([], pChunk);
        }
        return;
    }

    const chunks = chunkPlaceIds(normalized, ENRICH_PLACE_ID_BATCH);
    const batchSize = ENRICH_PLACE_ID_BATCH;
    for (let ci = 0; ci < chunks.length; ci += 1) {
        const chunk = chunks[ci] ?? [];
        const offset = ci * batchSize;
        const providerSlice =
            providerIds.length > 0 ? providerIds.slice(offset, offset + chunk.length) : undefined;
        await runBatch(chunk, providerSlice);
    }
}

/**
 * Start enrich/get as soon as the match list is known (overlaps React render + match effect).
 * Uses the same request shape as `fetchEnrichmentApi` after canonical sorting (stable dedupe keys).
 */
export function prefetchEnrichmentForMatchProviders(providers: { placeId?: string; providerId?: string }[]): void {
    const pairs: { place: string; prov: string }[] = [];
    for (const p of providers) {
        const place = typeof p.placeId === 'string' ? p.placeId.trim() : '';
        if (!place) continue;
        const raw = typeof p.providerId === 'string' ? p.providerId.trim() : '';
        pairs.push({
            place,
            prov: ENRICH_PROVIDER_UUID_RE.test(raw) ? raw : '',
        });
    }
    if (pairs.length === 0) return;
    void fetchEnrichmentApi(
        pairs.map((z) => z.place),
        { providerIdsAligned: pairs.map((z) => z.prov) }
    ).catch(() => undefined);
}

export async function fetchEnrichmentApi(
    placeIds: string[],
    options?: { providerIdsAligned?: string[] }
): Promise<Record<string, EnrichmentCacheEntry> | null> {
    const alignedIn = options?.providerIdsAligned;
    const pairs: { place: string; prov: string }[] = [];
    for (let i = 0; i < placeIds.length; i += 1) {
        const raw = typeof placeIds[i] === 'string' ? placeIds[i].trim() : '';
        if (!raw) continue;
        const p =
            alignedIn && typeof alignedIn[i] === 'string' ? alignedIn[i].trim() : '';
        pairs.push({
            place: raw,
            prov: ENRICH_PROVIDER_UUID_RE.test(p) ? p : '',
        });
    }
    if (pairs.length === 0) return null;
    /** Same order regardless of list sort so prefetch + match effect share in-flight dedupe. */
    const sorted = pairs
        .map((z) => ({
            place: z.place,
            prov: z.prov,
            norm: toGooglePlaceId(z.place),
        }))
        .sort((a, b) => (a.norm !== b.norm ? a.norm.localeCompare(b.norm) : a.prov.localeCompare(b.prov)));
    const normalized = sorted.map((z) => z.norm);
    const providerAligned = sorted.map((z) => z.prov);
    const chunks = chunkPlaceIds(normalized, ENRICH_PLACE_ID_BATCH);
    const merged: Record<string, EnrichmentCacheEntry> = {};
    await Promise.all(
        chunks.map(async (chunk, ci) => {
            const offset = ci * ENRICH_PLACE_ID_BATCH;
            const provChunk = providerAligned.slice(offset, offset + chunk.length);
            const body: { placeIds: string[]; providerIds?: string[] } = { placeIds: chunk };
            if (provChunk.length === chunk.length && provChunk.some(Boolean)) {
                body.providerIds = provChunk;
            }
            const key = enrichGetDedupeKey(chunk, provChunk);
            let inflight = enrichGetInFlight.get(key);
            if (!inflight) {
                inflight = (async (): Promise<Record<string, EnrichmentCacheEntry> | null> => {
                    const res = await fetch('/api/enrich/get', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    }).catch(() => null);
                    if (!res?.ok) return null;
                    const data = (await res.json().catch(() => null)) as {
                        cache?: Record<string, EnrichmentCacheEntry>;
                    } | null;
                    return data?.cache ?? null;
                })().finally(() => {
                    enrichGetInFlight.delete(key);
                });
                enrichGetInFlight.set(key, inflight);
            }
            const data = await inflight;
            if (data) Object.assign(merged, data);
        })
    );
    return Object.keys(merged).length > 0 ? merged : null;
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
