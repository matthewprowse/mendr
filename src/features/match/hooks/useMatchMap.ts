import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { MatchLocation, MatchProvider } from '../contracts';

export function useMatchMap(params: {
    userLocation: MatchLocation | null;
    providers: MatchProvider[];
    searchRadiusMeters: number;
    onMarkerClick?: (providerPlaceId: string) => void;
    /** When false, the search-radius circle is not drawn (e.g. pro onboard: pin only). Default true. */
    showSearchRadius?: boolean;
    /** When true, drop a marker at `userLocation`. Default false (match flow uses the circle + provider pins). */
    showUserPin?: boolean;
    /** Optional multi-zone overlay (used by pro onboard multi service areas). */
    userAreas?: Array<{ location: MatchLocation; radiusMeters: number }>;
}) {
    const {
        userLocation,
        providers,
        searchRadiusMeters,
        onMarkerClick,
        showSearchRadius = true,
        showUserPin = false,
        userAreas = [],
    } = params;
    const mapHostRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const userPinRef = useRef<google.maps.Marker | null>(null);
    const radiusCircleRef = useRef<google.maps.Circle | null>(null);
    const areaPinsRef = useRef<google.maps.Marker[]>([]);
    const areaCirclesRef = useRef<google.maps.Circle[]>([]);
    const [isMapReady, setIsMapReady] = useState(false);

    useEffect(() => {
        if (!mapHostRef.current) return;
        if (mapRef.current) return;
        const initialCenter =
            userAreas[0]?.location ??
            userLocation;
        if (!initialCenter) return;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        if (!apiKey) return;

        let cancelled = false;
        const globalKey = '__scandioGoogleMapsLoaderOptionsSet';
        if (!(globalThis as any)[globalKey]) {
            setOptions({ key: apiKey, version: 'weekly' } as any);
            (globalThis as any)[globalKey] = true;
        }

        void (async () => {
            await importLibrary('maps');
            await importLibrary('marker');
            if (cancelled || !mapHostRef.current) return;
            mapRef.current = new google.maps.Map(mapHostRef.current, {
                center: { lat: initialCenter.lat, lng: initialCenter.lng },
                zoom: 12,
                mapId: 'scandio-match-map',
                disableDefaultUI: true,
                clickableIcons: false,
            });
            setIsMapReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [userAreas, userLocation]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady) return;
        const hasUserAreas = userAreas.length > 0;
        const effectiveUserLocation = hasUserAreas ? userAreas[0]?.location ?? null : userLocation;
        if (!effectiveUserLocation) return;

        // Clear previous multi-area overlays.
        areaPinsRef.current.forEach((m) => {
            try {
                m.setMap(null);
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
            // Hide the single-radius/single-pin overlays when multi-area mode is active.
            radiusCircleRef.current?.setMap(null);
            userPinRef.current?.setMap(null);
        } else if (showSearchRadius && userLocation) {
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
                m.setMap(null);
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

        pts.forEach(({ provider, pos }) => {
            const marker = new google.maps.Marker({
                map,
                position: pos,
                title: provider.name,
            });
            if (onMarkerClick) {
                marker.addListener('click', () => onMarkerClick(provider.placeId));
            }
            markersRef.current.push(marker);
        });

        const pos = { lat: effectiveUserLocation.lat, lng: effectiveUserLocation.lng };
        if (!hasUserAreas && showUserPin) {
            if (!userPinRef.current) {
                userPinRef.current = new google.maps.Marker({
                    map,
                    position: pos,
                    title: 'Your location',
                });
            } else {
                userPinRef.current.setMap(map);
                userPinRef.current.setPosition(pos);
            }
        } else {
            userPinRef.current?.setMap(null);
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

                const pin = new google.maps.Marker({
                    map,
                    position: areaPos,
                    title: area.location.address || 'Service area',
                });
                areaPinsRef.current.push(pin);
            });
        }

        const singleUserView =
            !hasUserAreas && !showSearchRadius && pts.length === 0 && showUserPin;

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
    }, [isMapReady, onMarkerClick, providers, searchRadiusMeters, showSearchRadius, showUserPin, userAreas, userLocation]);

    return {
        mapHostRef,
        isMapReady,
    };
}
