'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { formatBusinessName, toWhatsAppPhone, isWhatsAppCapablePhone } from '@/lib/utils';
import type { Provider } from './types';

type ProvidersMapProps = {
    apiKey: string;
    providers: Provider[];
    emergingProviders?: Provider[];
    userLocation: { lat: number; lng: number; address?: string } | null;
    conversationId?: string;
};

function getDistanceText(
    provider: Provider,
    userLocation: { lat: number; lng: number } | null
): string {
    if (provider.distanceText) return `${provider.distanceText} km`;
    if (!userLocation || provider.latitude == null || provider.longitude == null) return '';
    const R = 6371;
    const dLat = ((provider.latitude - userLocation.lat) * Math.PI) / 180;
    const dLon = ((provider.longitude - userLocation.lng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLocation.lat * Math.PI) / 180) *
            Math.cos((provider.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return `${(R * c).toFixed(1)} km`;
}

// Standard teardrop/pin SVG path for provider markers
const PIN_PATH =
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

export function ProvidersMap({
    apiKey,
    providers,
    emergingProviders = [],
    userLocation,
    conversationId,
}: ProvidersMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
    const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [liveDuration, setLiveDuration] = useState<string>('');

    const allProviders = [...(providers ?? []), ...(emergingProviders ?? [])];
    const validProviders = allProviders.filter((p) => p.latitude != null && p.longitude != null);
    const total = validProviders.length;

    // Keep a stable ref to the current validProviders list so closures (markers, callbacks) always see the latest
    const validProvidersRef = useRef(validProviders);
    validProvidersRef.current = validProviders;

    const userLocationRef = useRef(userLocation);
    userLocationRef.current = userLocation;

    const drawDirections = useCallback(
        (index: number) => {
            const map = mapRef.current;
            const service = directionsServiceRef.current;
            const renderer = directionsRendererRef.current;
            if (!map || !service || !renderer) return;

            const provider = validProvidersRef.current[index];
            if (!provider || provider.latitude == null || provider.longitude == null) return;

            const loc = userLocationRef.current;

            if (!loc) {
                map.panTo({ lat: provider.latitude, lng: provider.longitude });
                map.setZoom(14);
                setLiveDuration('');
                return;
            }

            renderer.setMap(map);
            service.route(
                {
                    origin: { lat: loc.lat, lng: loc.lng },
                    destination: { lat: provider.latitude, lng: provider.longitude },
                    travelMode: google.maps.TravelMode.DRIVING,
                },
                (result, status) => {
                    if (status === google.maps.DirectionsStatus.OK && result) {
                        renderer.setDirections(result);
                        // Extract live travel duration from the first leg
                        const duration = result.routes?.[0]?.legs?.[0]?.duration?.text ?? '';
                        setLiveDuration(duration);
                    } else {
                        renderer.setMap(null);
                        setLiveDuration('');
                        const bounds = new google.maps.LatLngBounds();
                        bounds.extend({ lat: loc.lat, lng: loc.lng });
                        bounds.extend({ lat: provider.latitude!, lng: provider.longitude! });
                        map.fitBounds(bounds, { top: 60, right: 60, bottom: 240, left: 60 });
                    }
                }
            );
        },
        [] // stable — reads everything from refs
    );

    const updateMarkerIcons = useCallback((index: number) => {
        const hasUserMarker = userLocationRef.current != null;
        markersRef.current.forEach((marker, i) => {
            if (hasUserMarker && i === 0) return; // skip user location marker
            const providerIndex = hasUserMarker ? i - 1 : i;
            const isActive = providerIndex === index;
            if (isActive) {
                // Standard Google Maps destination pin for the active provider
                marker.setIcon({
                    path: PIN_PATH,
                    fillColor: '#EA4335',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 1.5,
                    scale: 1.8,
                    anchor: new google.maps.Point(12, 22),
                });
            } else {
                marker.setIcon({
                    path: PIN_PATH,
                    fillColor: '#64748b',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 1,
                    scale: 1.2,
                    anchor: new google.maps.Point(12, 22),
                });
            }
            marker.setZIndex(isActive ? 10 : 1);
        });
    }, []);

    // Initialise map once
    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        setOptions({ key: apiKey, v: 'weekly' });

        Promise.all([importLibrary('maps'), importLibrary('routes')])
            .then(() => {
                if (!containerRef.current) return;
                const center = userLocation
                    ? { lat: userLocation.lat, lng: userLocation.lng }
                    : { lat: -33.9249, lng: 18.4241 };

                const map = new google.maps.Map(containerRef.current, {
                    center,
                    zoom: 12,
                    disableDefaultUI: true,
                    zoomControl: false,
                    mapTypeControl: false,
                    scaleControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                });

                mapRef.current = map;
                directionsServiceRef.current = new google.maps.DirectionsService();
                directionsRendererRef.current = new google.maps.DirectionsRenderer({
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#0f172a',
                        strokeWeight: 4,
                        strokeOpacity: 0.8,
                    },
                });

                setLoading(false);
            })
            .catch(() => {
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            directionsRendererRef.current?.setMap(null);
            directionsRendererRef.current = null;
            directionsServiceRef.current = null;
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey]);

    // Place markers whenever providers/location changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new google.maps.LatLngBounds();

        if (userLocation) {
            bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
            markersRef.current.push(
                new google.maps.Marker({
                    map,
                    position: { lat: userLocation.lat, lng: userLocation.lng },
                    title: 'Your location',
                    zIndex: 20,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#3b82f6',
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                    },
                })
            );
        }

        validProviders.forEach((provider, i) => {
            const pos = { lat: provider.latitude!, lng: provider.longitude! };
            bounds.extend(pos);
            const isFirst = i === 0;
            const marker = new google.maps.Marker({
                map,
                position: pos,
                title: provider.name,
                icon: {
                    path: PIN_PATH,
                    fillColor: isFirst ? '#EA4335' : '#64748b',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: isFirst ? 1.5 : 1,
                    scale: isFirst ? 1.8 : 1.2,
                    anchor: new google.maps.Point(12, 22),
                },
                zIndex: isFirst ? 10 : 1,
            });
            // Clicking a pin jumps the card to that provider
            marker.addListener('click', () => setActiveIndex(i));
            markersRef.current.push(marker);
        });

        if (validProviders.length > 0 || userLocation) {
            try {
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                if (ne.equals(sw)) {
                    map.setCenter(bounds.getCenter());
                    map.setZoom(14);
                } else {
                    map.fitBounds(bounds, { top: 50, right: 50, bottom: 240, left: 50 });
                }
            } catch {
                if (userLocation) {
                    map.setCenter({ lat: userLocation.lat, lng: userLocation.lng });
                    map.setZoom(12);
                }
            }
        }

        setActiveIndex(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, validProviders.length, userLocation?.lat, userLocation?.lng]);

    useEffect(() => {
        if (loading || !mapRef.current) return;
        setLiveDuration('');
        updateMarkerIcons(activeIndex);
        drawDirections(activeIndex);
    }, [activeIndex, loading, drawDirections, updateMarkerIcons]);

    const goTo = useCallback(
        (next: number) => {
            if (total === 0) return;
            setActiveIndex(((next % total) + total) % total);
        },
        [total]
    );

    const activeProvider = validProviders[activeIndex] ?? null;
    const displayName = activeProvider ? formatBusinessName(activeProvider.name) : '';
    const distanceText = activeProvider ? getDistanceText(activeProvider, userLocation) : '';
    const durationText = activeProvider?.durationText ?? '';

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const providerUrl =
        activeProvider && (activeProvider.place_id ?? activeProvider.id)
            ? `${base}/pro/${encodeURIComponent(activeProvider.place_id ?? activeProvider.id ?? '')}`
            : '';

    const directionsUrl = activeProvider
        ? userLocation
            ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${userLocation.lat},${userLocation.lng}`)}&destination=${encodeURIComponent(`${activeProvider.latitude},${activeProvider.longitude}`)}&travelmode=driving`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activeProvider.latitude},${activeProvider.longitude}`)}`
        : '';

    const rawPhone = activeProvider?.phoneInternational ?? activeProvider?.phone;
    const waPhone = rawPhone ? toWhatsAppPhone(rawPhone) : null;
    const waCapable = rawPhone ? isWhatsAppCapablePhone(rawPhone) : false;
    const phoneUrl = activeProvider?.phone ? `tel:${activeProvider.phone}` : null;

    // First photo for the banner
    const bannerPhoto = activeProvider?.photos?.[0];
    const bannerUrl = bannerPhoto
        ? `/api/place-photo?name=${encodeURIComponent(bannerPhoto.name)}&maxWidthPx=480`
        : null;

    // Second photo for the avatar (or first if only one)
    const avatarPhoto = activeProvider?.photos?.[1] ?? activeProvider?.photos?.[0];
    const avatarUrl = avatarPhoto
        ? `/api/place-photo?name=${encodeURIComponent(avatarPhoto.name)}&maxWidthPx=80`
        : null;

    if (error) {
        return (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {error}
            </div>
        );
    }

    // Nav controls — shared between mobile and desktop
    const navControls = total > 1 ? (
        <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
            <button
                onClick={() => goTo(activeIndex - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-muted transition-colors"
                aria-label="Previous provider"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/>
                    <polyline points="12 19 5 12 12 5"/>
                </svg>
            </button>
            <div className="flex items-center gap-1.5">
                {Array.from({ length: total }).map((_, i) => (
                    <button
                        key={i}
                        onClick={() => goTo(i)}
                        aria-label={`Go to provider ${i + 1}`}
                        className={`h-1.5 w-1.5 rounded-full transition-colors duration-200 ${
                            i === activeIndex
                                ? 'bg-foreground'
                                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                        }`}
                    />
                ))}
            </div>
            <button
                onClick={() => goTo(activeIndex + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-muted transition-colors"
                aria-label="Next provider"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                </svg>
            </button>
        </div>
    ) : null;

    // Shared provider info content (used in both mobile strip and desktop overlay)
    const providerInfoContent = activeProvider ? (
        <div className="flex flex-col gap-3">
            {/* Name + rating row */}
            <div className="flex flex-col gap-0.5 min-w-0">
                {providerUrl ? (
                    <a
                        href={providerUrl}
                        rel="noopener noreferrer"
                        className="text-sm font-semibold leading-snug text-foreground hover:underline truncate"
                        title={displayName}
                    >
                        {displayName}
                    </a>
                ) : (
                    <span className="text-sm font-semibold leading-snug text-foreground truncate" title={displayName}>
                        {displayName}
                    </span>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {activeProvider.rating != null && (
                        <span className="flex items-center gap-0.5">
                            <span className="text-yellow-500">★</span>
                            <span className="font-medium text-foreground">{activeProvider.rating.toFixed(1)}</span>
                            {activeProvider.ratingCount != null && (
                                <span>({activeProvider.ratingCount})</span>
                            )}
                        </span>
                    )}
                    {(distanceText || liveDuration || durationText) && (
                        <>
                            {activeProvider.rating != null && <span>·</span>}
                            <span>{distanceText}</span>
                            {(liveDuration || durationText) && distanceText && <span>·</span>}
                            {(liveDuration || durationText) && <span>{liveDuration || durationText}</span>}
                        </>
                    )}
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                {(waCapable && waPhone) ? (
                    <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center rounded-md bg-foreground px-3 h-8 text-xs font-semibold text-background hover:bg-foreground/90 transition-colors"
                    >
                        Contact
                    </a>
                ) : phoneUrl ? (
                    <a
                        href={phoneUrl}
                        className="flex-1 inline-flex items-center justify-center rounded-md bg-foreground px-3 h-8 text-xs font-semibold text-background hover:bg-foreground/90 transition-colors"
                    >
                        Contact
                    </a>
                ) : null}
                {providerUrl && (
                    <a
                        href={providerUrl}
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                        View Profile
                    </a>
                )}
            </div>

            {navControls}
        </div>
    ) : null;

    return (
        <div className="w-full overflow-hidden rounded-lg border border-border bg-background">
            {/* Map + desktop overlay in a single relative container */}
            <div className="relative aspect-[4/3] sm:aspect-auto sm:h-[460px]">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                )}
                <div ref={containerRef} className="h-full w-full" />

                {/* Desktop-only overlay card — bottom right */}
                {!loading && activeProvider && (
                    <div className="hidden sm:block absolute bottom-3 right-3 z-10 w-60">
                        <div className="rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-md p-3">
                            {providerInfoContent}
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile-only info strip — below the map */}
            {!loading && activeProvider && (
                <div className="sm:hidden border-t border-border bg-background p-3">
                    {providerInfoContent}
                </div>
            )}
        </div>
    );
}
