'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';

type RoutesComputeResult = {
    localizedValues?: { duration?: string | null };
    durationMillis?: number | null;
    createPolylines: (opts?: {
        polylineOptions?: google.maps.PolylineOptions;
    }) => google.maps.Polyline[];
};
import { ArrowLeft, ArrowRight } from '@/lib/icons';
import { formatBusinessName } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { Provider } from '@/lib/providers/types';

type ProvidersMapProps = {
    apiKey: string;
    providers: Provider[];
    emergingProviders?: Provider[];
    nearbyOnlyProviders?: Provider[];
    userLocation: { lat: number; lng: number; address?: string } | null;
    conversationId?: string;
    /** When true, hide the floating card and mobile strip (e.g. report page shows its own distance overlay). */
    hideFloatingCard?: boolean;
    /** Controls which badges show in the top-left: ranking tags (default) or service-type filters. */
    mode?: 'rank' | 'service';
    /** Optional controlled active index; when provided, map follows this index instead of its own internal state. */
    activeIndex?: number;
    /** Notified when the active provider index changes (via map markers, tags, or internal controls). */
    onActiveIndexChange?: (index: number) => void;
    /** Optional custom wrapper className (defaults to inset card used on landing/report pages). */
    className?: string;
    /** Optional class for the map canvas area (defaults to aspect + responsive height). */
    mapInnerClassName?: string;
};

const DEFAULT_MAP_INNER_CLASS =
    'relative w-full aspect-[4/3] sm:aspect-auto sm:h-[460px]';

/** Fewer POI and area labels on the basemap (may be overridden by cloud Map ID styling). */
const MAP_BASE_CLUTTER_STYLES: google.maps.MapTypeStyle[] = [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
];

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

/** Numeric distance in km for sorting (closest first). */
function getDistanceKm(
    provider: Provider,
    userLocation: { lat: number; lng: number } | null
): number {
    if (!userLocation || provider.latitude == null || provider.longitude == null) return Infinity;
    const num = parseFloat(String(provider.distanceText ?? '').trim());
    if (!Number.isNaN(num)) return num;
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
    return R * c;
}

function formatDuration(text: string): string {
    return text.replace(/\bmins?\b/gi, 'Minutes').replace(/\bhrs?\b/gi, 'Hours');
}

// Standard teardrop/pin SVG path for provider markers
const PIN_PATH =
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

export function ProvidersMap({
    apiKey,
    providers,
    emergingProviders = [],
    nearbyOnlyProviders = [],
    userLocation,
    conversationId,
    hideFloatingCard = false,
    mode = 'rank',
    activeIndex: controlledActiveIndex,
    onActiveIndexChange,
    className,
    mapInnerClassName = DEFAULT_MAP_INNER_CLASS,
}: ProvidersMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
    const routeRequestSeqRef = useRef(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [internalActiveIndex, setInternalActiveIndex] = useState(0);
    const [liveDuration, setLiveDuration] = useState<string>('');

    const allProviders = [...(providers ?? []), ...(emergingProviders ?? []), ...(nearbyOnlyProviders ?? [])];
    const allValidProviders = allProviders.filter((p) => p.latitude != null && p.longitude != null);

    const [activeServiceFilter, setActiveServiceFilter] = useState<string | 'all'>('all');

    const serviceFilters = useMemo(() => {
        const set = new Set<string>();
        allValidProviders.forEach((p) => {
            (p.specialisations ?? []).forEach((s) => {
                if (s) set.add(s);
            });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [allValidProviders]);

    const validProviders = useMemo(() => {
        if (mode !== 'service' || activeServiceFilter === 'all') return allValidProviders;
        return allValidProviders.filter((p) =>
            (p.specialisations ?? []).includes(activeServiceFilter)
        );
    }, [allValidProviders, activeServiceFilter, mode]);

    const total = validProviders.length;

    const currentIndex = useMemo(
        () =>
            typeof controlledActiveIndex === 'number'
                ? Math.max(0, Math.min(controlledActiveIndex, Math.max(total - 1, 0)))
                : internalActiveIndex,
        [controlledActiveIndex, internalActiveIndex, total]
    );

    const setIndex = useCallback(
        (next: number) => {
            if (total === 0) {
                if (!onActiveIndexChange) setInternalActiveIndex(0);
                return;
            }
            const bounded = ((next % total) + total) % total;
            if (onActiveIndexChange) {
                onActiveIndexChange(bounded);
            } else {
                setInternalActiveIndex(bounded);
            }
        },
        [onActiveIndexChange, total]
    );

    // Indices for "Closest", "Best Rated", "Most Reviewed", "Menda's Pick"
    const tagIndices = useMemo(() => {
        if (validProviders.length === 0) {
            return { closest: 0, bestRated: 0, mostReviewed: 0, ourPick: 0 };
        }
        const withDist = validProviders.map((p, i) => ({
            i,
            km: getDistanceKm(p, userLocation),
            rating: p.rating ?? 0,
            ratingCount: p.ratingCount ?? 0,
            isFavourite: p.isFavourite === true,
        }));
        const closest = withDist.reduce((best, cur) => (cur.km < best.km ? cur : best)).i;
        const bestRated = withDist.reduce((best, cur) => {
            if (cur.rating !== best.rating) return cur.rating > best.rating ? cur : best;
            return cur.ratingCount > best.ratingCount ? cur : best;
        }).i;
        const mostReviewed = withDist.reduce((best, cur) =>
            cur.ratingCount > best.ratingCount ? cur : best
        ).i;
        const ourPickIdx = validProviders.findIndex((p) => p.isFavourite === true);
        const ourPick = ourPickIdx >= 0 ? ourPickIdx : 0;
        return { closest, bestRated, mostReviewed, ourPick };
    }, [validProviders, userLocation?.lat, userLocation?.lng]);

    // Keep a stable ref to the current validProviders list so closures (markers, callbacks) always see the latest
    const validProvidersRef = useRef(validProviders);
    validProvidersRef.current = validProviders;

    const userLocationRef = useRef(userLocation);
    userLocationRef.current = userLocation;

    const drawDirections = useCallback((index: number) => {
        const map = mapRef.current;
        if (!map) return;

        const reqId = ++routeRequestSeqRef.current;
        routePolylinesRef.current.forEach((p) => p.setMap(null));
        routePolylinesRef.current = [];
        setLiveDuration('');

        const provider = validProvidersRef.current[index];
        if (!provider || provider.latitude == null || provider.longitude == null) return;

        const loc = userLocationRef.current;

        if (!loc) {
            map.panTo({ lat: provider.latitude, lng: provider.longitude });
            map.setZoom(14);
            return;
        }

        const fitBoundsFallback = () => {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: loc.lat, lng: loc.lng });
            bounds.extend({ lat: provider.latitude!, lng: provider.longitude! });
            map.fitBounds(bounds, { top: 60, right: 60, bottom: 240, left: 60 });
        };

        void (async () => {
            try {
                const routesModule = await importLibrary('routes');
                const Route = (
                    routesModule as {
                        Route?: {
                            computeRoutes: (req: {
                                origin: google.maps.LatLngLiteral;
                                destination: google.maps.LatLngLiteral;
                                travelMode: google.maps.TravelMode;
                                fields: string[];
                            }) => Promise<{ routes: RoutesComputeResult[] }>;
                        };
                    }
                ).Route;
                if (!Route?.computeRoutes) {
                    if (reqId !== routeRequestSeqRef.current) return;
                    fitBoundsFallback();
                    return;
                }
                const { routes } = await Route.computeRoutes({
                    origin: { lat: loc.lat, lng: loc.lng },
                    destination: { lat: provider.latitude!, lng: provider.longitude! },
                    travelMode: google.maps.TravelMode.DRIVING,
                    fields: ['path', 'localizedValues', 'durationMillis'],
                });
                if (reqId !== routeRequestSeqRef.current) return;
                if (!routes?.length) {
                    fitBoundsFallback();
                    return;
                }
                const r0 = routes[0];
                const duration =
                    (r0.localizedValues?.duration && String(r0.localizedValues.duration).trim()) ||
                    (typeof r0.durationMillis === 'number' && Number.isFinite(r0.durationMillis)
                        ? `${Math.max(1, Math.round(r0.durationMillis / 60000))} min`
                        : '');
                setLiveDuration(duration);

                const polylines = r0.createPolylines({
                    polylineOptions: {
                        strokeColor: '#0f172a',
                        strokeWeight: 4,
                        strokeOpacity: 0.8,
                    },
                });
                polylines.forEach((pl) => {
                    pl.setMap(map);
                    routePolylinesRef.current.push(pl);
                });
            } catch {
                if (reqId !== routeRequestSeqRef.current) return;
                fitBoundsFallback();
            }
        })();
    }, []);

    const makeMarkerContent = (color: string, scale: number): Element => {
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
    };

    const updateMarkerIcons = useCallback((index: number) => {
        const hasUserMarker = userLocationRef.current != null;
        markersRef.current.forEach((marker, i) => {
            if (hasUserMarker && i === 0) return;
            const providerIndex = hasUserMarker ? i - 1 : i;
            const isActive = providerIndex === index;
            marker.content = makeMarkerContent(
                isActive ? '#EA4335' : '#64748b',
                isActive ? 1.8 : 1.2
            );
            marker.zIndex = isActive ? 10 : 1;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Initialise map once
    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        ensureGoogleMapsLoaderOptions(apiKey);

        const mapLoadTimeout = setTimeout(() => {
            setError('Map is taking too long to load.');
            setLoading(false);
        }, 15000);

        Promise.all([importLibrary('maps'), importLibrary('routes'), importLibrary('marker')])
            .then(() => {
                clearTimeout(mapLoadTimeout);
                setError(null);
                if (!containerRef.current) return;
                const center = userLocation
                    ? { lat: userLocation.lat, lng: userLocation.lng }
                    : { lat: -33.9249, lng: 18.4241 };

                const mapIdFromEnv = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '').trim();
                const map = new google.maps.Map(containerRef.current, {
                    center,
                    zoom: 12,
                    disableDefaultUI: true,
                    zoomControl: false,
                    mapTypeControl: false,
                    scaleControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    mapId: mapIdFromEnv || 'providers-map',
                    styles: MAP_BASE_CLUTTER_STYLES,
                });

                mapRef.current = map;

                setLoading(false);
            })
            .catch(() => {
                clearTimeout(mapLoadTimeout);
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            routePolylinesRef.current.forEach((p) => p.setMap(null));
            routePolylinesRef.current = [];
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey]);

    // Place markers whenever providers/location changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        markersRef.current.forEach((m) => {
            m.map = null;
        });
        markersRef.current = [];

        const bounds = new google.maps.LatLngBounds();

        if (userLocation) {
            bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
            const userDot = document.createElement('div');
            userDot.style.cssText =
                'width:20px;height:20px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)';
            const userMarker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: userLocation.lat, lng: userLocation.lng },
                title: 'Your location',
                content: userDot,
                zIndex: 20,
            });
            markersRef.current.push(userMarker);
        }

        validProviders.forEach((provider, i) => {
            const pos = { lat: provider.latitude!, lng: provider.longitude! };
            bounds.extend(pos);
            const isFirst = i === 0;
            const marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: pos,
                title: provider.name,
                content: makeMarkerContent(isFirst ? '#EA4335' : '#64748b', isFirst ? 1.8 : 1.2),
                zIndex: isFirst ? 10 : 1,
            });
            marker.addEventListener('gmp-click', () => setIndex(i));
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

        setIndex(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, validProviders.length, userLocation?.lat, userLocation?.lng, setIndex]);

    useEffect(() => {
        if (loading || !mapRef.current) return;
        setLiveDuration('');
        updateMarkerIcons(currentIndex);
        drawDirections(currentIndex);
    }, [currentIndex, loading, drawDirections, updateMarkerIcons]);

    const goTo = useCallback(
        (next: number) => {
            if (total === 0) return;
            setIndex(next);
        },
        [setIndex, total]
    );

    const activeProvider = validProviders[currentIndex] ?? null;
    const displayName = activeProvider ? formatBusinessName(activeProvider.name) : '';
    const distanceText = activeProvider ? getDistanceText(activeProvider, userLocation) : '';
    const durationText = activeProvider?.durationText ?? '';

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const providerUrl =
        activeProvider && (activeProvider.place_id ?? activeProvider.id)
            ? `${base}/contractors/${encodeURIComponent(activeProvider.place_id ?? activeProvider.id ?? '')}`
            : '';


    if (error) {
        return (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {error}
            </div>
        );
    }

    const providerInfoBlock = activeProvider && (
        <>
            <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                    {providerUrl ? (
                        <a
                            href={providerUrl}
                            rel="noopener noreferrer"
                            className="font-semibold text-base leading-snug text-foreground hover:underline truncate block"
                            title={displayName}
                        >
                            {displayName}
                        </a>
                    ) : (
                        <span className="font-semibold text-base leading-snug text-foreground truncate block" title={displayName}>
                            {displayName}
                        </span>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs">
                        {activeProvider.rating != null && (
                            <span className="flex items-center gap-0.5">
                                <span className="font-medium text-foreground">
                                    {activeProvider.rating.toFixed(1)}
                                </span>
                                {activeProvider.ratingCount != null && (
                                    <span className="text-muted-foreground">
                                        ({activeProvider.ratingCount} Reviews)
                                    </span>
                                )}
                            </span>
                        )}
                        {(distanceText || liveDuration || durationText) && (
                            <>
                                {activeProvider.rating != null && <span className="text-muted-foreground">·</span>}
                                {distanceText && <span className="text-muted-foreground">{distanceText}</span>}
                                {(liveDuration || durationText) && distanceText && <span className="text-muted-foreground">·</span>}
                                {(liveDuration || durationText) && (
                                    <span className="text-muted-foreground">
                                        {formatDuration(liveDuration || durationText)}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {total > 1 && (
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                            onClick={() => goTo(currentIndex - 1)}
                            className="flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                            aria-label="Previous provider"
                        >
                            <ArrowLeft className="size-3.5" />
                        </button>
                        <button
                            onClick={() => goTo(currentIndex + 1)}
                            className="flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                            aria-label="Next provider"
                        >
                            <ArrowRight className="size-3.5" />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 text-sm">
                {total > 1 ? (
                    <div className="flex items-center gap-1.5">
                        {validProviders.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                aria-label={`Go to provider ${i + 1}`}
                                className={`size-1.5 rounded-full transition-colors ${
                                    i === currentIndex
                                        ? 'bg-foreground'
                                        : 'bg-muted-foreground/40 hover:bg-muted-foreground/60'
                                }`}
                            />
                        ))}
                    </div>
                ) : <div />}

            </div>
        </>
    );

    const hasOurPick = validProviders.some((p) => p.isFavourite === true);
    const tagButtons = [
        { key: 'closest' as const, label: 'Closest', index: tagIndices.closest },
        { key: 'bestRated' as const, label: 'Best Rated', index: tagIndices.bestRated },
        { key: 'mostReviewed' as const, label: 'Most Reviewed', index: tagIndices.mostReviewed },
        ...(hasOurPick
            ? [{ key: 'ourPick' as const, label: "Menda's Pick", index: tagIndices.ourPick }]
            : []),
    ];

    const wrapperClass =
        className ??
        'w-[92%] mx-auto sm:w-full max-w-full overflow-hidden rounded-xl border border-border bg-background';

    return (
        <div className={wrapperClass}>
            {/* Map */}
            <div className={mapInnerClassName}>
                {/* Tags or service filters as badge cards – top left of map */}
                {!hideFloatingCard && !loading && validProviders.length > 0 && (
                    <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
                        {mode === 'service' && serviceFilters.length > 0 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveServiceFilter('all');
                                        setIndex(0);
                                    }}
                                >
                                    <Badge
                                        variant="secondary"
                                        className={[
                                            'cursor-pointer px-3 py-1.5 text-xs sm:text-[13px] font-medium',
                                            'shadow-sm',
                                            activeServiceFilter === 'all'
                                                ? 'bg-foreground text-background'
                                                : 'bg-card/95 text-muted-foreground hover:bg-card hover:text-foreground',
                                        ].join(' ')}
                                    >
                                        All
                                    </Badge>
                                </button>
                                {serviceFilters.map((label) => {
                                    const isActive = activeServiceFilter === label;
                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                                onClick={() => {
                                                    setActiveServiceFilter(label);
                                                    setIndex(0);
                                                }}
                                            aria-pressed={isActive}
                                        >
                                            <Badge
                                                variant="secondary"
                                                className={[
                                                    'cursor-pointer px-3 py-1.5 text-xs sm:text-[13px] font-medium',
                                                    'shadow-sm',
                                                    isActive
                                                        ? 'bg-foreground text-background'
                                                        : 'bg-card/95 text-muted-foreground hover:bg-card hover:text-foreground',
                                                ].join(' ')}
                                            >
                                                {label}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </>
                        ) : (
                            tagButtons.map(({ key, label, index }) => {
                                const isActive = currentIndex === index;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setIndex(index)}
                                        aria-pressed={isActive}
                                    >
                                        <Badge
                                            variant="secondary"
                                            className={[
                                                'cursor-pointer px-3 py-1.5 text-xs sm:text-[13px] font-medium',
                                                'shadow-sm',
                                                isActive
                                                    ? 'bg-foreground text-background'
                                                    : 'bg-card/95 text-muted-foreground hover:bg-card hover:text-foreground',
                                            ].join(' ')}
                                        >
                                            {label}
                                        </Badge>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                )}
                <div ref={containerRef} className="h-full w-full" />

                {/* Desktop only: skeleton for floating card while map loads */}
                {!hideFloatingCard && loading && (
                    <div className="hidden sm:flex absolute bottom-3 right-3 left-1/2 z-10 min-w-0 justify-end">
                        <div className="w-full max-w-full rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                            <div className="p-3 flex flex-col gap-2">
                                <div className="flex flex-col gap-1.5">
                                    <Skeleton className="h-4 w-[80%]" />
                                    <Skeleton className="h-3 w-[60%]" />
                                </div>
                                <Skeleton className="h-8 w-24 rounded-md" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Desktop only: floating card (no banner) */}
                {!hideFloatingCard && !loading && activeProvider && (
                    <div className="hidden sm:flex absolute bottom-3 right-3 left-1/2 z-10 min-w-0 justify-end">
                        <div className="w-full max-w-full rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
                            <div className="p-3 flex flex-col gap-2">
                                {providerInfoBlock}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile only: skeleton for provider strip while loading */}
            {!hideFloatingCard && loading && (
                <div className="sm:hidden border-t border-border bg-card p-3 flex flex-col gap-2">
                    <Skeleton className="h-4 w-[85%]" />
                    <Skeleton className="h-3 w-[60%]" />
                    <Skeleton className="h-8 w-28 rounded-md mt-1" />
                </div>
            )}

            {/* Mobile only: provider info below the map, no banner */}
            {!hideFloatingCard && !loading && activeProvider && (
                <div className="sm:hidden border-t border-border bg-card text-card-foreground p-3 flex flex-col gap-2">
                    {providerInfoBlock}
                </div>
            )}
        </div>
    );
}
