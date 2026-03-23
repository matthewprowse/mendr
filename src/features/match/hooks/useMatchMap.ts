import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { MatchLocation, MatchProvider } from '../contracts';

export function useMatchMap(params: {
    userLocation: MatchLocation | null;
    providers: MatchProvider[];
    searchRadiusMeters: number;
    onMarkerClick?: (providerPlaceId: string) => void;
}) {
    const { userLocation, providers, searchRadiusMeters, onMarkerClick } = params;
    const mapHostRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const radiusCircleRef = useRef<google.maps.Circle | null>(null);
    const [isMapReady, setIsMapReady] = useState(false);

    useEffect(() => {
        if (!mapHostRef.current) return;
        if (!userLocation) return;
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
                center: { lat: userLocation.lat, lng: userLocation.lng },
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
    }, [userLocation]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady || !userLocation) return;

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

        const bounds = new google.maps.LatLngBounds();
        const circleBounds = radiusCircleRef.current?.getBounds();
        if (circleBounds) bounds.union(circleBounds);
        else bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
        pts.forEach(({ pos }) => bounds.extend(pos));
        try {
            map.fitBounds(bounds, 48);
        } catch {}
    }, [isMapReady, onMarkerClick, providers, searchRadiusMeters, userLocation]);

    return {
        mapHostRef,
        isMapReady,
    };
}
