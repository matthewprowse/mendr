import { useEffect, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { boundsToSearchDisk } from '../map-viewport';
import type { MatchLocation, MatchProvider } from '../contracts';

const PIN_PATH =
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

function makeMarkerContent(color: string, scale: number): Element {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', `${24 * scale}`);
    svg.setAttribute('height', `${24 * scale}`);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PIN_PATH);
    path.setAttribute('fill', color);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', scale >= 1.5 ? '0.8' : '0.5');
    svg.appendChild(path);
    return svg;
}

function normalizePlaceKey(id: string): string {
    return id.replace(/^places\//, '').trim();
}

export type ViewportSearchPayload = {
    lat: number;
    lng: number;
    radiusMeters: number;
};

export function useMatchMap(params: {
    userLocation: MatchLocation | null;
    providers: MatchProvider[];
    /** Used when `showSearchRadius` draws the legacy circle (non–viewport-search mode). */
    searchRadiusMeters?: number;
    onMarkerClick?: (providerPlaceId: string) => void;
    showSearchRadius?: boolean;
    showUserPin?: boolean;
    userAreas?: Array<{ location: MatchLocation; radiusMeters: number }>;
    selectedPlaceId?: string | null;
    /** When true, map camera follows the user; providers load from visible bounds (idle). */
    viewportSearch?: boolean;
    onViewportSearch?: (payload: ViewportSearchPayload) => void;
}) {
    const {
        userLocation,
        providers,
        searchRadiusMeters = 10_000,
        onMarkerClick,
        showSearchRadius = true,
        showUserPin = false,
        userAreas = [],
        selectedPlaceId = null,
        viewportSearch = false,
        onViewportSearch,
    } = params;

    const onViewportSearchRef = useRef(onViewportSearch);
    onViewportSearchRef.current = onViewportSearch;

    const mapHostRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const userPinRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
    const radiusCircleRef = useRef<google.maps.Circle | null>(null);
    const areaPinsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const areaCirclesRef = useRef<google.maps.Circle[]>([]);
    const [isMapReady, setIsMapReady] = useState(false);
    const viewportSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastViewportPanKeyRef = useRef<string | null>(null);
    const lastViewportSearchKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!mapHostRef.current) return;
        if (mapRef.current) return;
        const initialCenter = userAreas[0]?.location ?? userLocation;
        if (!initialCenter) return;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        if (!apiKey) return;

        let cancelled = false;
        ensureGoogleMapsLoaderOptions(apiKey);

        void (async () => {
            await importLibrary('maps');
            await importLibrary('marker');
            if (cancelled || !mapHostRef.current) return;
            mapRef.current = new google.maps.Map(mapHostRef.current, {
                center: { lat: initialCenter.lat, lng: initialCenter.lng },
                zoom: viewportSearch ? 12 : 12,
                mapId: 'scandio-match-map',
                disableDefaultUI: true,
                clickableIcons: false,
                gestureHandling: viewportSearch ? 'greedy' : undefined,
            });
            setIsMapReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [userAreas, userLocation, viewportSearch]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady) return;
        const hasUserAreas = userAreas.length > 0;
        const effectiveUserLocation = hasUserAreas ? userAreas[0]?.location ?? null : userLocation;
        if (!effectiveUserLocation) return;

        areaPinsRef.current.forEach((m) => {
            try {
                m.map = null;
            } catch {}
        });
        areaPinsRef.current = [];
        areaCirclesRef.current.forEach((c) => {
            try {
                c.setMap(null);
            } catch {}
        });
        areaCirclesRef.current = [];

        if (hasUserAreas) {
            radiusCircleRef.current?.setMap(null);
            if (userPinRef.current) userPinRef.current.map = null;
        } else if (showSearchRadius && userLocation && !viewportSearch) {
            if (!radiusCircleRef.current) {
                radiusCircleRef.current = new google.maps.Circle({
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.45,
                    strokeWeight: 1.5,
                    fillColor: '#4f46e5',
                    fillOpacity: 0.08,
                    clickable: false,
                });
            }
            radiusCircleRef.current.setMap(map);
            radiusCircleRef.current.setCenter({ lat: userLocation.lat, lng: userLocation.lng });
            radiusCircleRef.current.setRadius(searchRadiusMeters);
        } else {
            radiusCircleRef.current?.setMap(null);
        }

        markersRef.current.forEach((m) => {
            try {
                m.map = null;
            } catch {}
        });
        markersRef.current = [];

        const pts = providers
            .map((p) =>
                p.latitude != null && p.longitude != null
                    ? { provider: p, pos: { lat: p.latitude, lng: p.longitude } }
                    : null
            )
            .filter(Boolean) as Array<{ provider: MatchProvider; pos: { lat: number; lng: number } }>;

        const selectedKey = selectedPlaceId ? normalizePlaceKey(selectedPlaceId) : '';

        pts.forEach(({ provider, pos }) => {
            const pid = normalizePlaceKey(provider.placeId);
            const isSelected = Boolean(selectedKey && pid === selectedKey);
            const marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: pos,
                title: provider.name,
                content: makeMarkerContent(isSelected ? '#EA4335' : '#64748b', isSelected ? 1.8 : 1.2),
            });
            if (onMarkerClick) {
                marker.addEventListener('gmp-click', () => onMarkerClick(provider.placeId));
            }
            markersRef.current.push(marker);
        });

        const pos = { lat: effectiveUserLocation.lat, lng: effectiveUserLocation.lng };
        if (!hasUserAreas && showUserPin) {
            if (!userPinRef.current) {
                userPinRef.current = new google.maps.marker.AdvancedMarkerElement({
                    map,
                    position: pos,
                    title: 'Your location',
                    content: makeMarkerContent('#3b82f6', 1.25),
                });
            } else {
                userPinRef.current.map = map;
                userPinRef.current.position = pos;
            }
        } else {
            if (userPinRef.current) userPinRef.current.map = null;
        }

        if (hasUserAreas) {
            userAreas.forEach((area) => {
                const areaPos = { lat: area.location.lat, lng: area.location.lng };
                const circle = new google.maps.Circle({
                    map,
                    center: areaPos,
                    radius: area.radiusMeters,
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.45,
                    strokeWeight: 1.5,
                    fillColor: '#4f46e5',
                    fillOpacity: 0.08,
                    clickable: false,
                });
                areaCirclesRef.current.push(circle);

                const pin = new google.maps.marker.AdvancedMarkerElement({
                    map,
                    position: areaPos,
                    title: area.location.address || 'Service area',
                    content: makeMarkerContent('#4f46e5', 1.2),
                });
                areaPinsRef.current.push(pin);
            });
        }

        if (viewportSearch) {
            return;
        }

        const singleUserView = !hasUserAreas && !showSearchRadius && pts.length === 0 && showUserPin;

        if (singleUserView) {
            map.setCenter(pos);
            map.setZoom(14);
            return;
        }

        const bounds = new google.maps.LatLngBounds();
        if (hasUserAreas) {
            let hasAnyCircleBounds = false;
            areaCirclesRef.current.forEach((circle) => {
                const b = circle.getBounds();
                if (b) {
                    bounds.union(b);
                    hasAnyCircleBounds = true;
                }
            });
            if (!hasAnyCircleBounds) {
                userAreas.forEach((area) =>
                    bounds.extend({ lat: area.location.lat, lng: area.location.lng }),
                );
            }
        } else if (showSearchRadius) {
            const singleCircleBounds = radiusCircleRef.current?.getBounds();
            if (singleCircleBounds) bounds.union(singleCircleBounds);
            else bounds.extend(pos);
        } else {
            bounds.extend(pos);
        }
        pts.forEach(({ pos: p }) => bounds.extend(p));

        try {
            map.fitBounds(bounds, 48);
        } catch {}
    }, [
        isMapReady,
        onMarkerClick,
        providers,
        searchRadiusMeters,
        selectedPlaceId,
        showSearchRadius,
        showUserPin,
        userAreas,
        userLocation,
        viewportSearch,
    ]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady || !viewportSearch) return;

        const run = () => {
            const cb = onViewportSearchRef.current;
            if (!cb) return;
            const b = map.getBounds();
            if (!b) return;
            const disk = boundsToSearchDisk(b);
            const searchKey = `${disk.lat.toFixed(3)},${disk.lng.toFixed(3)}|${Math.round(disk.radiusMeters / 500) * 500}`;
            if (lastViewportSearchKeyRef.current === searchKey) return;
            lastViewportSearchKeyRef.current = searchKey;
            cb(disk);
        };

        const scheduleRun = () => {
            if (viewportSearchDebounceRef.current) clearTimeout(viewportSearchDebounceRef.current);
            viewportSearchDebounceRef.current = setTimeout(() => {
                viewportSearchDebounceRef.current = null;
                run();
            }, 100);
        };

        let isFirstIdle = true;
        const onIdle = () => {
            if (viewportSearchDebounceRef.current) clearTimeout(viewportSearchDebounceRef.current);
            if (isFirstIdle) {
                isFirstIdle = false;
                queueMicrotask(run);
                return;
            }
            scheduleRun();
        };

        const listeners: google.maps.MapsEventListener[] = [
            google.maps.event.addListener(map, 'idle', onIdle),
            google.maps.event.addListener(map, 'dragend', () => scheduleRun()),
            google.maps.event.addListener(map, 'zoom_changed', () => scheduleRun()),
        ];

        return () => {
            if (viewportSearchDebounceRef.current) {
                clearTimeout(viewportSearchDebounceRef.current);
                viewportSearchDebounceRef.current = null;
            }
            listeners.forEach((l) => l.remove());
        };
    }, [isMapReady, viewportSearch]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady || !viewportSearch || !userLocation) return;
        const addr = userLocation.address.trim();
        const panKey = addr ? `addr:${addr}` : `ll:${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`;
        if (lastViewportPanKeyRef.current === panKey) return;
        lastViewportPanKeyRef.current = panKey;
        map.panTo({ lat: userLocation.lat, lng: userLocation.lng });
    }, [isMapReady, userLocation, viewportSearch]);

    return {
        mapHostRef,
        isMapReady,
    };
}
