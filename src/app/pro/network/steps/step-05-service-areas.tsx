'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { SquarePen, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientId } from '@/lib/client-random-id';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { shortenSaAddress } from './utils';
import { DEFAULT_SERVICE_RADIUS_KM, type ServiceRadius } from './types';

type Suggestion = { placeId: string; mainText: string; secondaryText: string };
type SelectedPlace = { address: string; lat: number; lng: number };
const MAX_SUGGESTIONS = 3;

/** Matches search-radius styling on `/match` (`useMatchMap`). */
function ServiceRadiusMap({ radii }: { radii: ServiceRadius[] }) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const overlaysRef = useRef<google.maps.Circle[]>([]);
    const markersRef = useRef<google.maps.Marker[]>([]);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;
        ensureGoogleMapsLoaderOptions(apiKey);
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                mapRef.current = new google.maps.Map(containerRef.current, {
                    center: { lat: -33.9249, lng: 18.4241 },
                    zoom: 12,
                    disableDefaultUI: true,
                    clickableIcons: false,
                    mapId: 'mendr-match-map',
                });
            })
            .catch(() => {
                mapRef.current = null;
            });
    }, [apiKey]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        overlaysRef.current.forEach((overlay) => overlay.setMap(null));
        overlaysRef.current = [];
        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];
        if (radii.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        radii.forEach((r) => {
            const center = { lat: r.lat, lng: r.lng };
            const circle = new google.maps.Circle({
                map,
                center,
                radius: r.radiusKm * 1000,
                strokeColor: '#4f46e5',
                strokeOpacity: 0.45,
                strokeWeight: 1.5,
                fillColor: '#4f46e5',
                fillOpacity: 0.08,
                clickable: false,
            });
            overlaysRef.current.push(circle);
            // Centre point marker for each radius.
            const marker = new google.maps.Marker({ map, position: center });
            markersRef.current.push(marker);
            const circleBounds = circle.getBounds();
            if (circleBounds) bounds.union(circleBounds);
        });

        try {
            map.fitBounds(bounds, 48);
        } catch {
            /* ignore */
        }
    }, [radii]);

    if (!apiKey) {
        return (
            <div className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-lg bg-secondary text-sm text-muted-foreground">
                Map unavailable (no API key)
            </div>
        );
    }

    return (
        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-secondary">
            <div ref={containerRef} className="absolute inset-0 h-full w-full rounded-lg" />
        </div>
    );
}

export function StepServiceAreas() {
    const { radii, setRadii, maxRadii } = useWizard();

    // Inline add/edit editor state — mirrors the homeowner addresses page.
    const [editorOpen, setEditorOpen] = useState(false);
    const [mode, setMode] = useState<'add' | 'edit'>('add');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [address, setAddress] = useState('');
    const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_SERVICE_RADIUS_KM);
    const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [fetchingSuggestions, setFetchingSuggestions] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autocompleteServiceRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placesServiceRef = useRef<any>(null);
    const placesNodeRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Init Places services when the editor opens.
    useEffect(() => {
        if (!editorOpen) return;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
        if (!apiKey || typeof window === 'undefined') return;
        let cancelled = false;
        void (async () => {
            try {
                ensureGoogleMapsLoaderOptions(apiKey);
                await importLibrary('places');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (cancelled || !(window as any).google?.maps) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                autocompleteServiceRef.current = new (window as any).google.maps.places.AutocompleteService();
                if (!placesNodeRef.current) {
                    placesNodeRef.current = document.createElement('div');
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                placesServiceRef.current = new (window as any).google.maps.places.PlacesService(placesNodeRef.current);
            } catch {
                /* silent */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editorOpen]);

    const handleAddressChange = (value: string) => {
        setAddress(value);
        setSelectedPlace(null);
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!value.trim() || value.length < 3) return;
        debounceRef.current = setTimeout(() => {
            const service = autocompleteServiceRef.current;
            if (!service) return;
            setFetchingSuggestions(true);
            service.getPlacePredictions(
                { input: value, componentRestrictions: { country: 'za' } },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (predictions: any[], status: string) => {
                    setFetchingSuggestions(false);
                    if (status === 'OK' && predictions) {
                        setSuggestions(
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            predictions.slice(0, MAX_SUGGESTIONS).map((p: any) => ({
                                placeId: p.place_id,
                                mainText: p.structured_formatting?.main_text ?? p.description,
                                secondaryText: p.structured_formatting?.secondary_text ?? '',
                            }))
                        );
                    } else {
                        setSuggestions([]);
                    }
                }
            );
        }, 300);
    };

    const handleSelectSuggestion = (s: Suggestion) => {
        setSuggestions([]);
        const fallback = [s.mainText, s.secondaryText].filter(Boolean).join(', ');
        const service = placesServiceRef.current;
        if (!service) {
            setAddress(fallback);
            return;
        }
        service.getDetails(
            { placeId: s.placeId, fields: ['formatted_address', 'geometry'] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (place: any, status: string) => {
                if (status !== 'OK' || !place) return;
                const addr: string = shortenSaAddress(place.formatted_address ?? fallback);
                const lat: number | undefined = place.geometry?.location?.lat?.();
                const lng: number | undefined = place.geometry?.location?.lng?.();
                setAddress(addr);
                if (lat != null && lng != null) {
                    setSelectedPlace({ address: addr, lat, lng });
                }
            }
        );
    };

    const openAdd = () => {
        setMode('add');
        setEditingId(null);
        setAddress('');
        setRadiusKm(DEFAULT_SERVICE_RADIUS_KM);
        setSelectedPlace(null);
        setSuggestions([]);
        setEditorOpen(true);
    };

    const openEdit = (area: ServiceRadius) => {
        setMode('edit');
        setEditingId(area.id);
        setAddress(area.address);
        setRadiusKm(area.radiusKm);
        // Pre-confirm coords so Save is enabled without re-selecting.
        setSelectedPlace(
            area.lat !== 0 && area.lng !== 0 ? { address: area.address, lat: area.lat, lng: area.lng } : null
        );
        setSuggestions([]);
        setEditorOpen(true);
    };

    const resetForm = () => {
        setEditorOpen(false);
        setMode('add');
        setEditingId(null);
        setAddress('');
        setRadiusKm(DEFAULT_SERVICE_RADIUS_KM);
        setSelectedPlace(null);
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };

    const handleSave = () => {
        if (!selectedPlace) {
            toast.error('Select an address from the suggestions.');
            return;
        }
        if (!Number.isFinite(radiusKm) || radiusKm < 1) {
            toast.error('Enter a radius of at least 1 km.');
            return;
        }
        if (mode === 'edit' && editingId) {
            setRadii(
                radii.map((r) =>
                    r.id === editingId
                        ? { ...r, address: selectedPlace.address, lat: selectedPlace.lat, lng: selectedPlace.lng, radiusKm }
                        : r
                )
            );
        } else {
            setRadii([
                ...radii,
                {
                    id: createClientId(),
                    address: selectedPlace.address,
                    lat: selectedPlace.lat,
                    lng: selectedPlace.lng,
                    radiusKm,
                },
            ]);
        }
        resetForm();
    };

    const handleDelete = (id: string) => {
        setRadii(radii.filter((r) => r.id !== id));
    };

    const atCap = radii.length >= maxRadii;

    const editorSection = (
        <div className="flex w-full flex-col gap-6">
            <div className="flex w-full flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">
                    {mode === 'edit' ? 'Edit Area' : 'Add Area'}
                </h2>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <RequiredLabel htmlFor="svc-addr">Centre Address</RequiredLabel>
                <div className="flex flex-col gap-2">
                    <Input
                        id="svc-addr"
                        autoComplete="off"
                        className="h-10 text-sm"
                        value={address}
                        onChange={(e) => handleAddressChange(e.target.value)}
                    />
                    {fetchingSuggestions ? (
                        <div className="flex flex-col">
                            {[0, 1, 2].map((i) => (
                                <Fragment key={i}>
                                    {i > 0 ? <Separator /> : null}
                                    <div className="flex items-center gap-3 py-3">
                                        <Skeleton className="size-12 shrink-0 rounded-md" />
                                        <div className="flex flex-1 flex-col gap-1.5">
                                            <Skeleton className="h-3.5 w-2/5 rounded" />
                                            <Skeleton className="h-3 w-4/5 rounded" />
                                        </div>
                                    </div>
                                </Fragment>
                            ))}
                        </div>
                    ) : suggestions.length > 0 ? (
                        <div className="flex flex-col">
                            {suggestions.map((s, i) => (
                                <Fragment key={s.placeId}>
                                    {i > 0 ? <Separator /> : null}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleSelectSuggestion(s)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleSelectSuggestion(s);
                                            }
                                        }}
                                        className="flex cursor-pointer items-center gap-3 py-3"
                                    >
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="icon"
                                            className="size-12 shrink-0"
                                            tabIndex={-1}
                                            aria-hidden="true"
                                        />
                                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <p className="text-sm font-medium leading-snug">{s.mainText}</p>
                                            {s.secondaryText ? (
                                                <p className="line-clamp-1 text-xs leading-snug text-muted-foreground">
                                                    {s.secondaryText}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </Fragment>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <RequiredLabel htmlFor="svc-km">Radius (Kilometers)</RequiredLabel>
                <div className="flex flex-col gap-2">
                    <Input
                        id="svc-km"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        className="h-10 text-sm"
                        value={String(radiusKm)}
                        onChange={(e) => setRadiusKm(Math.max(1, Number(e.target.value.replace(/[^\d.]/g, '')) || 1))}
                    />
                    <p className="text-xs text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Button type="button" onClick={handleSave} disabled={!selectedPlace}>
                    {mode === 'edit' ? 'Save Changes' : 'Save Area'}
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                </Button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Where You Work"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />

            <ServiceRadiusMap radii={radii.filter((r) => r.lat !== 0 && r.lng !== 0)} />

            {radii.length > 0 ? (
                <div className="flex flex-col">
                    {radii.map((area, index) => (
                        <div key={area.id}>
                            {index > 0 && <Separator />}
                            <div className="flex items-center gap-3 py-3">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="size-12 shrink-0"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="line-clamp-1 text-sm font-medium">
                                        {area.address || 'Service area'}
                                    </p>
                                    <p className="line-clamp-1 text-xs text-muted-foreground">
                                        {area.radiusKm} {area.radiusKm === 1 ? 'Kilometre' : 'Kilometres'} Radius
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        aria-label="Edit area"
                                        onClick={() => openEdit(area)}
                                    >
                                        <SquarePen size={16} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        aria-label="Remove area"
                                        onClick={() => handleDelete(area.id)}
                                    >
                                        <X size={16} strokeWidth={2.5} />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {editorOpen ? (
                editorSection
            ) : !atCap ? (
                <Button type="button" variant="secondary" className="w-full" onClick={openAdd}>
                    Add Area
                </Button>
            ) : null}
        </div>
    );
}
