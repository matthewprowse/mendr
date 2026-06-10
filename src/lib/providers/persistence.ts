export function toGooglePlaceId(placeId: string): string {
    return placeId.startsWith('places/') ? placeId : `places/${placeId}`;
}

/**
 * Supabase `.in('google_place_id', …)` must match how rows were stored (canonical `places/…` vs legacy raw IDs).
 */
export function expandPlaceIdsForDbQuery(placeIds: string[]): string[] {
    const out = new Set<string>();
    for (const id of placeIds) {
        if (typeof id !== 'string' || !id.trim()) continue;
        const canonical = toGooglePlaceId(id.trim());
        const raw = canonical.replace(/^places\//, '');
        out.add(canonical);
        out.add(raw);
    }
    return [...out];
}
