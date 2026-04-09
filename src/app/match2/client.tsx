'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importLibrary } from '@googlemaps/js-api-loader';
import { renderToStaticMarkup } from 'react-dom/server';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { ScanFlowShell } from '@/components/scan-flow-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from '@phosphor-icons/react';
import { Star } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type MockProvider = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    address: string;
    driveTime: string;
    rating: number;
    reviewCount: number;
    summary: string;
    open: boolean;
};

const MOCK_PROVIDERS: MockProvider[] = [
    {
        id: '1',
        name: 'CapeFlow Plumbing',
        lat: -33.9801,
        lng: 18.4668,
        address: '12 Main Road, Claremont, Cape Town',
        driveTime: '18 Minutes',
        rating: 4.8,
        reviewCount: 124,
        summary:
            'Fast leak response and tidy workmanship. Most customers mention clear communication and transparent pricing.',
        open: true,
    },
    {
        id: '2',
        name: 'Southside Leak Specialists',
        lat: -33.9584,
        lng: 18.4742,
        address: '22 Campground Road, Rondebosch, Cape Town',
        driveTime: '23 Minutes',
        rating: 4.6,
        reviewCount: 86,
        summary:
            'Strong diagnostics and same-day scheduling for urgent callouts. Good follow-up after repairs are completed.',
        open: true,
    },
    {
        id: '3',
        name: 'PipeCare Services',
        lat: -33.9756,
        lng: 18.4516,
        address: '3 Kildare Road, Newlands, Cape Town',
        driveTime: '29 Minutes',
        rating: 4.4,
        reviewCount: 63,
        summary:
            'Good option for planned maintenance jobs and non-emergency repairs. Customers highlight courteous technicians.',
        open: false,
    },
    {
        id: '4',
        name: 'Neighbourhood Plumbing Co.',
        lat: -33.9867,
        lng: 18.4699,
        address: '55 Imam Haron Road, Claremont, Cape Town',
        driveTime: '31 Minutes',
        rating: 4.3,
        reviewCount: 52,
        summary:
            'Reliable smaller team with practical fixes and reasonable pricing. Helpful for repeat household plumbing issues.',
        open: true,
    },
    {
        id: '5',
        name: 'Urban Water Fix',
        lat: -34.0092,
        lng: 18.4824,
        address: '90 Belvedere Road, Kenilworth, Cape Town',
        driveTime: '34 Minutes',
        rating: 4.1,
        reviewCount: 41,
        summary:
            'Solid all-round provider for everyday plumbing tasks. Reviewers often mention punctual arrivals.',
        open: true,
    },
    {
        id: '6',
        name: 'Metro Leak & Repair',
        lat: -34.0237,
        lng: 18.466,
        address: '17 Stanhope Road, Plumstead, Cape Town',
        driveTime: '37 Minutes',
        rating: 4.0,
        reviewCount: 29,
        summary:
            'Useful backup option with straightforward booking and communication via phone and WhatsApp.',
        open: false,
    },
];

const HEADER_STOP_TOP_PX = 72;
const SHEET_MIN_HEIGHT_PX = 348;
const SHEET_MAX_RADIUS_PX = 16;
const SHEET_RADIUS_REDUCTION_DISTANCE_PX = 196;

export default function Match2PageClient() {
    const router = useRouter();
    const [addressInput, setAddressInput] = useState('12 Main Road, Claremont, Cape Town');
    const [sheetMode, setSheetMode] = useState<'half' | 'full'>('half');
    const [sheetTopPx, setSheetTopPx] = useState<number | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapInteracting, setIsMapInteracting] = useState(false);

    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const markerRefs = useRef<Array<{ setMap: (map: google.maps.Map | null) => void }>>([]);
    const providerElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const listScrollRef = useRef<HTMLDivElement | null>(null);
    const sheetTopRef = useRef<number | null>(null);
    const contentTouchYRef = useRef<number | null>(null);
    const dragStartYRef = useRef(0);
    const dragStartTopRef = useRef(0);
    const [isDraggingSheet, setIsDraggingSheet] = useState(false);

    const topProviders = useMemo(() => MOCK_PROVIDERS.slice(0, 5), []);
    const getCollapsedTop = useCallback(() => {
        if (typeof window === 'undefined') return HEADER_STOP_TOP_PX;
        return Math.max(HEADER_STOP_TOP_PX, window.innerHeight - SHEET_MIN_HEIGHT_PX);
    }, []);

    const setSheetTopFromScroll = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (sheetMode === 'full') {
            setSheetTopPx(HEADER_STOP_TOP_PX);
            return;
        }
        setSheetTopPx(getCollapsedTop());
    }, [getCollapsedTop, sheetMode]);

    useEffect(() => {
        sheetTopRef.current = sheetTopPx;
    }, [sheetTopPx]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setSheetTopFromScroll();
        const onResize = () => {
            if (sheetMode === 'full') {
                setSheetTopPx(HEADER_STOP_TOP_PX);
            } else {
                setSheetTopPx(getCollapsedTop());
            }
        };
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [getCollapsedTop, setSheetTopFromScroll, sheetMode]);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {
                // Keep default map center based on providers when location is unavailable.
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
    }, []);

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
        if (!apiKey || !mapRef.current || typeof window === 'undefined') return;

        let cancelled = false;
        const mountMap = async () => {
            ensureGoogleMapsLoaderOptions(apiKey);
            await importLibrary('maps');
            await importLibrary('marker');
            if (cancelled || !mapRef.current || !(window as any).google?.maps) return;

            const defaultCenter =
                userLocation ?? {
                    lat: topProviders[0]?.lat ?? -33.97,
                    lng: topProviders[0]?.lng ?? 18.46,
                };

            const configuredMapId = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '').trim();
            const hasValidMapId = configuredMapId.length > 0;
            const mapOptions: google.maps.MapOptions = {
                center: defaultCenter,
                zoom: 12,
                disableDefaultUI: true,
                zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                gestureHandling: 'greedy',
            };
            if (hasValidMapId) {
                mapOptions.mapId = configuredMapId;
            }
            const map = new window.google.maps.Map(mapRef.current, mapOptions);
            mapInstanceRef.current = map;
            setIsMapReady(true);

            const recenterUserForVisibleMapArea = (loc: { lat: number; lng: number }) => {
                map.setCenter(loc);
                // Push the visual focus upward into the unobscured map area
                // (above the base bottom sheet height).
                window.google.maps.event.addListenerOnce(map, 'idle', () => {
                    map.panBy(0, -Math.round(SHEET_MIN_HEIGHT_PX / 2));
                });
            };

            let mapInteractionTimer: ReturnType<typeof setTimeout> | null = null;
            const markMapInteracting = () => {
                setIsMapInteracting(true);
                if (mapInteractionTimer) {
                    clearTimeout(mapInteractionTimer);
                }
                mapInteractionTimer = setTimeout(() => {
                    setIsMapInteracting(false);
                }, 450);
            };
            map.addListener('dragstart', markMapInteracting);
            map.addListener('zoom_changed', markMapInteracting);
            map.addListener('bounds_changed', markMapInteracting);
            map.addListener('idle', () => {
                if (mapInteractionTimer) {
                    clearTimeout(mapInteractionTimer);
                }
                mapInteractionTimer = setTimeout(() => {
                    setIsMapInteracting(false);
                }, 120);
            });

            markerRefs.current.forEach((marker) => marker.setMap(null));
            markerRefs.current = [];

            topProviders.forEach((provider) => {
                const onProviderMarkerClick = () => {
                    setSheetMode('full');
                    setSheetTopPx(HEADER_STOP_TOP_PX);
                    window.setTimeout(() => {
                        providerElementRefs.current[provider.id]?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                        });
                    }, 150);
                };

                if (hasValidMapId) {
                    const badgeHost = document.createElement('div');
                    badgeHost.innerHTML = renderToStaticMarkup(
                        <Badge variant="outline" className="bg-background">
                            {provider.name}
                        </Badge>
                    );

                    const advanced = new (window as any).google.maps.marker.AdvancedMarkerElement({
                        map,
                        position: { lat: provider.lat, lng: provider.lng },
                        title: `${provider.name} (${provider.rating.toFixed(1)})`,
                        content: badgeHost,
                    });
                    advanced.addEventListener('gmp-click', onProviderMarkerClick);
                    markerRefs.current.push({
                        setMap: (nextMap) => {
                            advanced.map = nextMap;
                        },
                    });
                    return;
                }

                const marker = new window.google.maps.Marker({
                    map,
                    position: { lat: provider.lat, lng: provider.lng },
                    title: `${provider.name} (${provider.rating.toFixed(1)})`,
                    label: {
                        text: provider.rating.toFixed(1),
                        color: '#0f172a',
                        fontSize: '12px',
                        fontWeight: '700',
                    },
                });
                marker.addListener('click', onProviderMarkerClick);
                markerRefs.current.push(marker);
            });

            if (userLocation) {
                const userMarker = hasValidMapId
                    ? new (window as any).google.maps.marker.AdvancedMarkerElement({
                          map,
                          position: userLocation,
                          title: 'Your Location',
                          content: (() => {
                              const userPin = document.createElement('div');
                              userPin.className = 'h-6 w-6 rounded-full border-2 border-white bg-blue-600 shadow';
                              return userPin;
                          })(),
                      })
                    : new window.google.maps.Marker({
                          map,
                          position: userLocation,
                          title: 'Your Location',
                          icon: {
                              path: window.google.maps.SymbolPath.CIRCLE,
                              scale: 7,
                              fillColor: '#2563eb',
                              fillOpacity: 1,
                              strokeColor: '#ffffff',
                              strokeWeight: 2,
                          },
                      });
                markerRefs.current.push(userMarker);
                recenterUserForVisibleMapArea(userLocation);
            }
        };

        void mountMap();
        return () => {
            cancelled = true;
            setIsMapInteracting(false);
        };
    }, [topProviders, userLocation]);

    const expandSheet = useCallback(() => {
        setSheetMode('full');
        setSheetTopPx(HEADER_STOP_TOP_PX);
        sheetTopRef.current = HEADER_STOP_TOP_PX;
    }, []);

    const handleSheetDragStart = useCallback((clientY: number) => {
        dragStartYRef.current = clientY;
        dragStartTopRef.current = sheetTopPx ?? getCollapsedTop();
        setIsDraggingSheet(true);
    }, [getCollapsedTop, sheetTopPx]);

    const handleSheetDragMove = useCallback((clientY: number) => {
        if (!isDraggingSheet || typeof window === 'undefined') return;
        const deltaY = clientY - dragStartYRef.current;
        const minTop = HEADER_STOP_TOP_PX;
        const maxTop = getCollapsedTop();
        const nextTop = Math.min(maxTop, Math.max(minTop, dragStartTopRef.current + deltaY));
        setSheetTopPx(nextTop);
        sheetTopRef.current = nextTop;
    }, [getCollapsedTop, isDraggingSheet]);

    const handleSheetDragEnd = useCallback(() => {
        if (!isDraggingSheet) return;
        setIsDraggingSheet(false);
        const currentTop = sheetTopPx ?? getCollapsedTop();
        const midpoint = (HEADER_STOP_TOP_PX + getCollapsedTop()) / 2;
        if (currentTop <= midpoint) {
            setSheetMode('full');
            setSheetTopPx(HEADER_STOP_TOP_PX);
            sheetTopRef.current = HEADER_STOP_TOP_PX;
        } else {
            setSheetMode('half');
            setSheetTopPx(getCollapsedTop());
            sheetTopRef.current = getCollapsedTop();
        }
    }, [getCollapsedTop, isDraggingSheet, sheetTopPx]);

    const handleSheetWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const el = listScrollRef.current;
        if (!el || isDraggingSheet) return;

        const currentTop = sheetTopRef.current ?? getCollapsedTop();
        const collapsedTop = getCollapsedTop();
        const deltaY = event.deltaY;

        // Scrolling down should raise the sheet first.
        if (deltaY > 0 && currentTop > HEADER_STOP_TOP_PX) {
            const consume = Math.min(deltaY, currentTop - HEADER_STOP_TOP_PX);
            const nextTop = currentTop - consume;
            sheetTopRef.current = nextTop;
            setSheetTopPx(nextTop);
            if (nextTop <= HEADER_STOP_TOP_PX + 0.5) setSheetMode('full');
            event.preventDefault();
            return;
        }

        // Scrolling up at top of list should lower the sheet back down.
        if (deltaY < 0 && el.scrollTop <= 0 && currentTop < collapsedTop) {
            const consume = Math.min(-deltaY, collapsedTop - currentTop);
            const nextTop = currentTop + consume;
            sheetTopRef.current = nextTop;
            setSheetTopPx(nextTop);
            if (nextTop >= collapsedTop - 0.5) {
                setSheetMode('half');
                setSheetTopPx(collapsedTop);
                sheetTopRef.current = collapsedTop;
            }
            event.preventDefault();
        }
    }, [getCollapsedTop, isDraggingSheet]);

    useEffect(() => {
        const el = listScrollRef.current;
        if (!el) return;

        const onTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            contentTouchYRef.current = touch ? touch.clientY : null;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (isDraggingSheet) return;
            const touch = event.touches[0];
            if (!touch) return;

            const prevY = contentTouchYRef.current;
            contentTouchYRef.current = touch.clientY;
            if (prevY == null) return;

            const dy = touch.clientY - prevY;
            const currentTop = sheetTopRef.current ?? getCollapsedTop();
            const collapsedTop = getCollapsedTop();

            // Swipe up: lift sheet first before content scroll.
            if (dy < 0 && currentTop > HEADER_STOP_TOP_PX) {
                const consume = Math.min(-dy, currentTop - HEADER_STOP_TOP_PX);
                const nextTop = currentTop - consume;
                sheetTopRef.current = nextTop;
                setSheetTopPx(nextTop);
                if (nextTop <= HEADER_STOP_TOP_PX + 0.5) setSheetMode('full');
                event.preventDefault();
                return;
            }

            // Swipe down at top of content: lower sheet first.
            if (dy > 0 && el.scrollTop <= 0 && currentTop < collapsedTop) {
                const nextTop = Math.min(collapsedTop, currentTop + dy);
                sheetTopRef.current = nextTop;
                setSheetTopPx(nextTop);
                if (nextTop >= collapsedTop - 0.5) {
                    setSheetMode('half');
                    setSheetTopPx(collapsedTop);
                    sheetTopRef.current = collapsedTop;
                }
                event.preventDefault();
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
        };
    }, [getCollapsedTop, isDraggingSheet]);

    const collapsedTop = getCollapsedTop();
    const baseTop = sheetTopPx ?? collapsedTop;
    const renderedTop = baseTop;
    const effectiveTop = renderedTop;
    const radiusReductionStartTop = HEADER_STOP_TOP_PX + SHEET_RADIUS_REDUCTION_DISTANCE_PX;
    const radiusProgress = Math.min(
        1,
        Math.max(
            0,
            (effectiveTop - HEADER_STOP_TOP_PX) / SHEET_RADIUS_REDUCTION_DISTANCE_PX
        )
    );
    const dynamicTopRadius =
        effectiveTop >= radiusReductionStartTop ? SHEET_MAX_RADIUS_PX : SHEET_MAX_RADIUS_PX * radiusProgress;
    const isSheetFullyStretched = effectiveTop <= HEADER_STOP_TOP_PX + 0.5;
    const isSheetContentScrollable = isSheetFullyStretched;

    useEffect(() => {
        const el = listScrollRef.current;
        if (!el) return;
        if (!isSheetContentScrollable && el.scrollTop !== 0) {
            el.scrollTop = 0;
        }
    }, [isSheetContentScrollable]);

    useEffect(() => {
        if (typeof window === 'undefined' || !isDraggingSheet) return;
        const onMouseMove = (event: MouseEvent) => handleSheetDragMove(event.clientY);
        const onMouseUp = () => handleSheetDragEnd();
        const onTouchMove = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!touch) return;
            handleSheetDragMove(touch.clientY);
        };
        const onTouchEnd = () => handleSheetDragEnd();

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [handleSheetDragEnd, handleSheetDragMove, isDraggingSheet]);

    return (
        <ScanFlowShell
            onClose={() => router.back()}
            constrainContentWidth
            contentClassName="pb-[52dvh]"
            logoClassName="hidden"
            headerClassName="bg-background shadow-md"
            headerLeft={
                <Button
                    variant="outline"
                    className="size-10"
                    onClick={() => router.back()}
                >
                    <ArrowLeft size={24} weight="bold" className="text-foreground" />
                </Button>
            }
            headerRight={
                <Input
                    id="match2-address-input"
                    className="h-10 w-full"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                />
            }
        >
            <div
                className="fixed inset-x-0 z-20 overflow-hidden bg-muted"
                style={{ top: `${HEADER_STOP_TOP_PX}px`, bottom: 0 }}
            >
                <div ref={mapRef} className="absolute inset-0" />
                {!isMapReady ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        <p className="text-sm text-muted-foreground">Loading map…</p>
                    </div>
                ) : null}
            </div>

            <div
                className="fixed inset-x-0 z-30 mx-auto flex w-full max-w-3xl touch-pan-y flex-col gap-4 overflow-y-auto bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
                ref={listScrollRef}
                onWheel={handleSheetWheel}
                style={{
                    top: `${renderedTop}px`,
                    height: `calc(100dvh - ${renderedTop}px)`,
                    minHeight: `${SHEET_MIN_HEIGHT_PX}px`,
                    borderTopLeftRadius: dynamicTopRadius,
                    borderTopRightRadius: dynamicTopRadius,
                    borderWidth: 0,
                    willChange: 'top, border-top-left-radius, border-top-right-radius',
                    overflowY: isSheetContentScrollable ? 'auto' : 'hidden',
                    boxShadow:
                        '0 -8px 30px rgba(15, 23, 42, 0.12), 0 -2px 8px rgba(15, 23, 42, 0.06)',
                }}
            >
                    <button
                        type="button"
                        onClick={expandSheet}
                        onMouseDown={(event) => handleSheetDragStart(event.clientY)}
                        onTouchStart={(event) => {
                            const touch = event.touches[0];
                            if (!touch) return;
                            handleSheetDragStart(touch.clientY);
                        }}
                        className="mx-auto flex h-5 w-20 items-center justify-center"
                        aria-label="Expand recommendations"
                    >
                        <span className="h-1.5 w-10 rounded-full bg-muted" />
                    </button>
                    <p className="text-sm text-foreground font-medium text-center">
                        {topProviders.length} Service Providers
                    </p>
                    <h3 className="text-xl font-bold text-foreground">Top Recommendations</h3>

                    <div className="flex flex-col gap-4">
                        {topProviders.map((provider) => (
                            <div
                                key={provider.id}
                                className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6"
                                ref={(node) => {
                                    providerElementRefs.current[provider.id] = node;
                                }}
                            >
                                <div className="flex flex-col gap-2">
                                    <h3 className="truncate text-lg font-bold text-foreground">
                                        {provider.name}
                                    </h3>
                                    <div className="flex flex-row items-center gap-2">
                                        <Star
                                            className="size-5 fill-yellow-500 text-yellow-500"
                                            aria-hidden="true"
                                        />
                                        <p className="text-sm font-bold text-foreground">
                                            {provider.rating.toFixed(1)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            ({provider.reviewCount} Reviews)
                                        </p>
                                        <Badge variant="secondary">
                                            {provider.open ? 'Open' : 'Closed'}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <p className="text-sm text-muted-foreground">{provider.summary}</p>
                                </div>

                                <div className="flex flex-row gap-4 justify-end">
                                    <Button type="button" variant="ghost" className="h-10 flex-1">
                                        View Profile
                                    </Button>
                                    <Button type="button" className="h-10 flex-1">
                                        Contact Contractor
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Separator className="my-2" />

                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold text-foreground">Other Recommendations</h3>
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                        </p>
                    </div>
            </div>
        </ScanFlowShell>
    );
}
