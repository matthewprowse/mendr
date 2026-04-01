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

export async function fetchProvidersApi(
    payload: ProvidersRequest,
    options?: { signal?: AbortSignal }
): Promise<ProvidersResponse | null> {
    const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options?.signal,
    });
    const data = (await res.json().catch(() => null)) as ProvidersResponse | null;
    if (!res.ok) return data;
    return data;
}

export async function geocodeApi(payload: GeocodeRequest): Promise<GeocodeResponse | null> {
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
