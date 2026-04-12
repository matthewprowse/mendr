/** Max Places search radius (meters) — keep within API/product limits. */
export const VIEWPORT_SEARCH_RADIUS_MAX_M = 50_000;
/** Avoid tiny searches when the map is extremely zoomed in. */
export const VIEWPORT_SEARCH_RADIUS_MIN_M = 1_200;

function haversineMeters(a: google.maps.LatLng, b: google.maps.LatLng): number {
    const R = 6371000;
    const lat1 = (a.lat() * Math.PI) / 180;
    const lat2 = (b.lat() * Math.PI) / 180;
    const dLat = ((b.lat() - a.lat()) * Math.PI) / 180;
    const dLng = ((b.lng() - a.lng()) * Math.PI) / 180;
    const s =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Airbnb-style search disk: center of visible map + radius covering the viewport corners.
 */
export function boundsToSearchDisk(bounds: google.maps.LatLngBounds): {
    lat: number;
    lng: number;
    radiusMeters: number;
} {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = bounds.getCenter();
    const nw = new google.maps.LatLng(ne.lat(), sw.lng());
    const se = new google.maps.LatLng(sw.lat(), ne.lng());
    const raw = Math.max(
        haversineMeters(center, ne),
        haversineMeters(center, sw),
        haversineMeters(center, nw),
        haversineMeters(center, se)
    );
    const radiusMeters = Math.min(
        VIEWPORT_SEARCH_RADIUS_MAX_M,
        Math.max(VIEWPORT_SEARCH_RADIUS_MIN_M, raw)
    );
    return { lat: center.lat(), lng: center.lng(), radiusMeters };
}
