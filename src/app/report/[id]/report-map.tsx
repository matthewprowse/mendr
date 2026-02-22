'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

type ReportMapProps = {
    apiKey: string;
    origin?: { lat: number; lng: number };
    destination: { lat: number; lng: number } | string;
};

export function ReportMap({ apiKey, origin, destination }: ReportMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        const dest =
            typeof destination === 'string'
                ? destination
                : { lat: destination.lat, lng: destination.lng };

        let hiddenPanel: HTMLDivElement | null = null;

        setOptions({ key: apiKey, v: 'weekly' });
        const loadLibs = origin && typeof dest !== 'string'
            ? [importLibrary('maps'), importLibrary('routes')]
            : typeof dest === 'string'
                ? [importLibrary('maps'), importLibrary('geocoding')]
                : [importLibrary('maps')];
        Promise.all(loadLibs)
            .then(() => {
                if (!containerRef.current) return;
                const center =
                    typeof dest === 'string'
                        ? { lat: -33.9, lng: 18.4 }
                        : { lat: dest.lat, lng: dest.lng };

                const map = new google.maps.Map(containerRef.current, {
                    center,
                    zoom: 14,
                    disableDefaultUI: true,
                    zoomControl: false,
                    mapTypeControl: false,
                    scaleControl: false,
                    streetViewControl: false,
                    rotateControl: false,
                    fullscreenControl: false,
                });
                mapRef.current = map;

                if (origin && typeof dest !== 'string') {
                    const directionsService = new google.maps.DirectionsService();
                    hiddenPanel = document.createElement('div');
                    hiddenPanel.setAttribute('aria-hidden', 'true');
                    hiddenPanel.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
                    document.body.appendChild(hiddenPanel);
                    const directionsRenderer = new google.maps.DirectionsRenderer({
                        map,
                        panel: hiddenPanel,
                        suppressMarkers: true,
                        suppressInfoWindows: true,
                    });
                    directionsService.route(
                        {
                            origin: new google.maps.LatLng(origin.lat, origin.lng),
                            destination: new google.maps.LatLng(dest.lat, dest.lng),
                            travelMode: google.maps.TravelMode.DRIVING,
                        },
                        (result, status) => {
                            if (status === google.maps.DirectionsStatus.OK && result) {
                                directionsRenderer.setDirections(result);
                            } else {
                                new google.maps.Marker({
                                    map,
                                    position: dest,
                                });
                            }
                            setLoading(false);
                        }
                    );
                } else if (typeof dest === 'string') {
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ address: dest }, (results, status) => {
                        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
                            const loc = results[0].geometry.location;
                            map.setCenter(loc);
                            new google.maps.Marker({ map, position: loc });
                        }
                        setLoading(false);
                    });
                } else {
                    new google.maps.Marker({
                        map,
                        position: dest,
                    });
                    setLoading(false);
                }
            })
            .catch((err) => {
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            mapRef.current = null;
            hiddenPanel?.parentNode?.removeChild(hiddenPanel);
        };
    }, [apiKey, origin, destination]);

    if (error) {
        return (
            <div className="w-full aspect-video min-h-[200px] flex items-center justify-center bg-muted text-muted-foreground text-sm">
                {error}
            </div>
        );
    }

    return (
        <div className="relative w-full aspect-video min-h-[200px] overflow-hidden">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
}
