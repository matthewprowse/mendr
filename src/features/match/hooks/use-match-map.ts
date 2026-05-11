import { useEffect, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { boundsToSearchDisk } from '../map-viewport';
import type { MatchLocation, MatchProvider } from '../contracts';

/** Compact filled-star SVG used inside the rating pill marker. */
const STAR_PATH =
    'M12 2.5l2.952 5.98 6.598.96-4.775 4.654 1.127 6.572L12 17.66l-5.902 3.006 1.127-6.572L2.45 9.44l6.598-.96L12 2.5z';

function appendStarSvg(parent: HTMLElement, fill: string, sizePx: number) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', `${sizePx}`);
    svg.setAttribute('height', `${sizePx}`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', STAR_PATH);
    path.setAttribute('fill', fill);
    svg.appendChild(path);
    parent.appendChild(svg);
}

/**
 * Build an Airbnb-style rating pill marker (white pill with filled star + rating number).
 * Selected = inverted dark pill with a small name tooltip beneath.
 * Falls back to "New" when no rating is available.
 */
function makeRatingPillContent(params: {
    rating: number | null | undefined;
    name?: string | null;
    selected: boolean;
}): HTMLElement {
    const { rating, name, selected } = params;
    const wrapper = document.createElement('div');
    wrapper.className = 'scandio-marker';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '4px';
    wrapper.style.transform = selected ? 'translateY(-2px)' : 'translateY(0)';
    wrapper.style.transition = 'transform 120ms ease-out';

    const pill = document.createElement('div');
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '4px';
    pill.style.padding = selected ? '6px 10px' : '4px 8px';
    pill.style.borderRadius = '999px';
    pill.style.fontFamily =
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    pill.style.fontSize = selected ? '13px' : '12px';
    pill.style.fontWeight = '600';
    pill.style.lineHeight = '1';
    pill.style.boxShadow = selected
        ? '0 6px 18px rgba(15, 23, 42, 0.25), 0 1px 0 rgba(0,0,0,0.06)'
        : '0 1px 2px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)';
    pill.style.cursor = 'pointer';
    pill.style.userSelect = 'none';
    pill.style.whiteSpace = 'nowrap';
    pill.style.background = selected ? '#16120E' : '#ffffff';
    pill.style.color = selected ? '#ffffff' : '#16120E';

    appendStarSvg(pill, selected ? '#ffffff' : '#F59E0B', selected ? 13 : 12);

    const label = document.createElement('span');
    if (typeof rating === 'number' && Number.isFinite(rating)) {
        label.textContent = rating.toFixed(1);
    } else {
        label.textContent = 'New';
        label.style.fontWeight = '500';
    }
    pill.appendChild(label);
    wrapper.appendChild(pill);

    if (selected && name) {
        const tooltip = document.createElement('div');
        tooltip.textContent = name;
        tooltip.style.maxWidth = '180px';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.background = '#16120E';
        tooltip.style.color = '#ffffff';
        tooltip.style.fontSize = '11px';
        tooltip.style.fontWeight = '500';
        tooltip.style.lineHeight = '1.2';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.overflow = 'hidden';
        tooltip.style.textOverflow = 'ellipsis';
        tooltip.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.2)';
        wrapper.appendChild(tooltip);
    }

    return wrapper;
}

/** "You are here" pin: blue dot with white ring + soft halo. */
function makeUserPinContent(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'scandio-user-pin';
    wrapper.style.position = 'relative';
    wrapper.style.width = '22px';
    wrapper.style.height = '22px';

    const halo = document.createElement('div');
    halo.style.position = 'absolute';
    halo.style.inset = '-6px';
    halo.style.borderRadius = '999px';
    halo.style.background = 'rgba(59, 130, 246, 0.18)';

    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.inset = '0';
    dot.style.borderRadius = '999px';
    dot.style.background = '#3b82f6';
    dot.style.border = '3px solid #ffffff';
    dot.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.25)';

    wrapper.appendChild(halo);
    wrapper.appendChild(dot);
    return wrapper;
}

/** Service-area pin (used when caller passes `userAreas`). Indigo dot to differentiate from user. */
function makeAreaPinContent(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.width = '14px';
    wrapper.style.height = '14px';
    wrapper.style.borderRadius = '999px';
    wrapper.style.background = '#4f46e5';
    wrapper.style.border = '3px solid #ffffff';
    wrapper.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.25)';
    return wrapper;
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
                content: makeRatingPillContent({
                    rating: provider.rating ?? null,
                    name: provider.name,
                    selected: isSelected,
                }),
                zIndex: isSelected ? 1000 : undefined,
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
                    content: makeUserPinContent(),
                });
            } else {
                userPinRef.current.map = map;
                userPinRef.current.position = pos;
                userPinRef.current.content = makeUserPinContent();
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
                    content: makeAreaPinContent(),
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
