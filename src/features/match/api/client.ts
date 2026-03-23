import type {
    GeocodeRequest,
    GeocodeResponse,
    ProvidersRequest,
    ProvidersResponse,
} from '../contracts';

export async function fetchProvidersApi(payload: ProvidersRequest): Promise<ProvidersResponse | null> {
    const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
