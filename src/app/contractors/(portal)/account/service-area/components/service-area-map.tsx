'use client';

import { useEffect, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';

type Props = {
    initialLat: number | null;
    initialLng: number | null;
    initialRadiusKm: number;
    onChange: (next: { lat: number; lng: number; radiusKm: number }) => void;
};

// Cape Town CBD fallback when the contractor has no centre yet.
const FALLBACK_CENTER = { lat: -33.9249, lng: 18.4241 } as const;

// Western Cape rough rectangle — restricts panning so contractors can't drop
// a pin outside the supported region.
const WC_BOUNDS = { south: -34.5, west: 17.5, north: -32.5, east: 21 } as const;

const RADIUS_MIN_KM = 5;
const RADIUS_MAX_KM = 50;

function clampRadiusKm(km: number): number {
    if (!Number.isFinite(km)) return RADIUS_MIN_KM;
    return Math.max(RADIUS_MIN_KM, Math.min(RADIUS_MAX_KM, Math.round(km)));
}

/**
 * Interactive service-area editor: draggable pin + draggable/editable circle
 * + radius slider. Calls `onChange` (debounced 300 ms) whenever the user
 * adjusts the centre or radius.
 */
export default function ServiceAreaMap({
    initialLat,
    initialLng,
    initialRadiusKm,
    onChange,
}: Props) {
    const mapHostRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const circleRef = useRef<google.maps.Circle | null>(null);
    const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const startLat = initialLat ?? FALLBACK_CENTER.lat;
    const startLng = initialLng ?? FALLBACK_CENTER.lng;
    const [radiusKm, setRadiusKm] = useState<number>(clampRadiusKm(initialRadiusKm));
    const [center, setCenter] = useState<{ lat: number; lng: number }>({
        lat: startLat,
        lng: startLng,
    });
    const [suburbLabel, setSuburbLabel] = useState<string | null>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);

    // Push center+radius to the parent (debounced).
    function emit(next: { lat: number; lng: number; radiusKm: number }) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            onChangeRef.current(next);
        }, 300);
    }

    // ── Map bootstrap ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapHostRef.current || mapRef.current) return;
        const apiKey =
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
            process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            setMapError('Google Maps API key is not configured.');
            return;
        }
        let cancelled = false;
        ensureGoogleMapsLoaderOptions(apiKey);

        void (async () => {
            try {
                await importLibrary('maps');
                await importLibrary('marker');
                if (cancelled || !mapHostRef.current) return;

                const map = new google.maps.Map(mapHostRef.current, {
                    center: { lat: startLat, lng: startLng },
                    zoom: 11,
                    mapId: 'mendr-service-area-map',
                    disableDefaultUI: true,
                    zoomControl: true,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                    restriction: {
                        latLngBounds: WC_BOUNDS,
                        strictBounds: false,
                    },
                });
                mapRef.current = map;

                // Editable circle: drag handles let the user resize the radius
                // visually; the slider stays in sync via `radius_changed`.
                const circle = new google.maps.Circle({
                    map,
                    center: { lat: startLat, lng: startLng },
                    radius: clampRadiusKm(initialRadiusKm) * 1000,
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.6,
                    strokeWeight: 2,
                    fillColor: '#4f46e5',
                    fillOpacity: 0.1,
                    editable: true,
                    draggable: false, // dragged via the centre pin instead
                    clickable: false,
                });
                circleRef.current = circle;

                const pinEl = document.createElement('div');
                pinEl.style.width = '20px';
                pinEl.style.height = '20px';
                pinEl.style.borderRadius = '999px';
                pinEl.style.background = '#4f46e5';
                pinEl.style.border = '3px solid #ffffff';
                pinEl.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.25)';

                const marker = new google.maps.marker.AdvancedMarkerElement({
                    map,
                    position: { lat: startLat, lng: startLng },
                    gmpDraggable: true,
                    content: pinEl,
                    title: 'Drag to move your service-area centre',
                });
                markerRef.current = marker;

                // Marker drag → re-centre circle + emit.
                marker.addListener('dragend', () => {
                    const p = marker.position;
                    if (!p) return;
                    const lat = typeof p.lat === 'function' ? p.lat() : (p as google.maps.LatLngLiteral).lat;
                    const lng = typeof p.lng === 'function' ? p.lng() : (p as google.maps.LatLngLiteral).lng;
                    circle.setCenter({ lat, lng });
                    setCenter({ lat, lng });
                    emit({ lat, lng, radiusKm: Math.round(circle.getRadius() / 1000) });
                });

                // Circle radius edited via the drag handles → sync slider + emit.
                circle.addListener('radius_changed', () => {
                    const newKm = clampRadiusKm(circle.getRadius() / 1000);
                    // Snap back if the user blew past the max via dragging the handle.
                    if (newKm * 1000 !== circle.getRadius()) {
                        circle.setRadius(newKm * 1000);
                    }
                    setRadiusKm(newKm);
                    const c = circle.getCenter();
                    if (c) emit({ lat: c.lat(), lng: c.lng(), radiusKm: newKm });
                });

                // Circle centre edited (some Google versions let users drag the
                // circle itself even when `draggable: false`, depending on the
                // handle layout). Keep marker in sync defensively.
                circle.addListener('center_changed', () => {
                    const c = circle.getCenter();
                    if (!c) return;
                    marker.position = { lat: c.lat(), lng: c.lng() };
                });

                setIsMapReady(true);
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load Google Maps for service area editor:', err);
                    setMapError('Map failed to load. Please refresh and try again.');
                }
            }
        })();

        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // Initial values are stable across the lifetime of this component
        // (parent re-renders without changing them). We deliberately don't
        // re-init the map on every parent render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Slider → circle.
    useEffect(() => {
        const circle = circleRef.current;
        if (!circle || !isMapReady) return;
        if (Math.round(circle.getRadius() / 1000) !== radiusKm) {
            circle.setRadius(radiusKm * 1000);
        }
    }, [radiusKm, isMapReady]);

    // ── Reverse geocode the centre to a suburb label (best-effort) ───────────
    useEffect(() => {
        if (!isMapReady) return;
        let cancelled = false;
        (async () => {
            try {
                await importLibrary('geocoding');
                if (cancelled) return;
                const geocoder = new google.maps.Geocoder();
                const res = await geocoder.geocode({
                    location: { lat: center.lat, lng: center.lng },
                });
                if (cancelled) return;
                const first = res.results?.[0];
                if (!first) {
                    setSuburbLabel(null);
                    return;
                }
                // Prefer sublocality / locality / neighborhood — falls back to
                // a trimmed formatted address otherwise.
                const preferred = first.address_components.find((c) =>
                    c.types.some((t) =>
                        ['sublocality', 'sublocality_level_1', 'neighborhood', 'locality'].includes(t),
                    ),
                );
                setSuburbLabel(preferred?.long_name ?? first.formatted_address.split(',')[0]?.trim() ?? null);
            } catch {
                if (!cancelled) setSuburbLabel(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [center.lat, center.lng, isMapReady]);

    function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
        const next = clampRadiusKm(Number(e.target.value));
        setRadiusKm(next);
        const circle = circleRef.current;
        const c = circle?.getCenter();
        if (c) {
            emit({ lat: c.lat(), lng: c.lng(), radiusKm: next });
        } else {
            emit({ lat: center.lat, lng: center.lng, radiusKm: next });
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <div
                ref={mapHostRef}
                className="h-[320px] w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 md:h-[400px]"
                aria-label="Service area map editor"
                role="application"
            />
            {mapError && (
                <p className="text-sm text-red-600" role="alert">
                    {mapError}
                </p>
            )}
            <div className="flex flex-col gap-2">
                <label htmlFor="service-area-radius" className="text-sm font-medium text-gray-700">
                    Radius: {radiusKm} km
                </label>
                <input
                    id="service-area-radius"
                    type="range"
                    min={RADIUS_MIN_KM}
                    max={RADIUS_MAX_KM}
                    step={1}
                    value={radiusKm}
                    onChange={handleSliderChange}
                    className="w-full accent-indigo-600"
                    aria-label={`Service area radius: ${radiusKm} kilometres`}
                />
                <p className="text-sm text-gray-600">
                    Your service area: ~{radiusKm} km radius
                    {suburbLabel ? ` around ${suburbLabel}` : ''}.
                </p>
            </div>
        </div>
    );
}
