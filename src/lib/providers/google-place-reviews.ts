/**
 * Google Places API (New): fetch review text for a place resource name.
 */
export async function fetchPlaceReviewsFromGoogle(
    placeResourceName: string,
    apiKey: string | undefined
): Promise<any[]> {
    if (!apiKey) return [];
    const placeName = (placeResourceName || '').trim();
    if (!placeName) return [];
    const fullName = placeName.startsWith('places/') ? placeName : `places/${placeName}`;
    const url = `https://places.googleapis.com/v1/${fullName}`;
    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(url, {
            method: 'GET',
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'id,reviews,reviews.name,reviews.rating,reviews.publishTime,reviews.relativePublishTimeDescription,reviews.originalText,reviews.text,reviews.authorAttribution',
            },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const place = await res.json().catch(() => null);
        const reviews = place?.reviews;
        return Array.isArray(reviews) ? reviews : [];
    } catch {
        return [];
    }
}

export function mapGoogleReviewsToInput(googleReviews: any[]) {
    return (googleReviews || [])
        .map((r: any) => {
            const rawBody =
                (typeof r?.originalText?.text === 'string' && r.originalText.text) ||
                (typeof r?.text?.text === 'string' && r.text.text) ||
                (typeof r?.text === 'string' && r.text) ||
                '';
            const body = String(rawBody || '').trim();
            if (!body) return null;
            return {
                rating: typeof r?.rating === 'number' ? r.rating : null,
                text: { text: body },
            };
        })
        .filter(Boolean) as Array<{ rating: number | null; text: { text: string } }>;
}
