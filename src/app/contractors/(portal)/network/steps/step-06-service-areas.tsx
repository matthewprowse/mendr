'use client';

import { useCallback, useEffect, useRef } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { geocodeApi } from '@/features/match/api/client';
import { createClientId } from '@/lib/client-random-id';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { toTitleCaseWords } from './utils';
import { DEFAULT_SERVICE_RADIUS_KM, type ServiceRadius } from './types';

/** Matches search-radius styling on `/match` (`useMatchMap`). */
function ServiceRadiusMap({
    radii,
    selectedId: _selectedId,
    onSelect: _onSelect,
}: {
    radii: ServiceRadius[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const overlaysRef = useRef<google.maps.Circle[]>([]);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;
        ensureGoogleMapsLoaderOptions(apiKey);
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: -33.9249, lng: 18.4241 },
                    zoom: 12,
                    disableDefaultUI: true,
                    clickableIcons: false,
                    mapId: 'scandio-match-map',
                });
                mapRef.current = map;
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
            <div className="relative flex h-52 w-full items-center justify-center overflow-hidden rounded-lg bg-secondary text-sm text-muted-foreground">
                Map unavailable (no API key)
            </div>
        );
    }

    return (
        <div className="relative h-52 w-full overflow-hidden rounded-lg bg-secondary">
            <div ref={containerRef} className="absolute inset-0 h-full w-full rounded-lg" />
        </div>
    );
}

function ServiceRadiusRowEditor({
    row,
    onPatch,
    onRemove,
    showRemove,
}: {
    row: ServiceRadius;
    onPatch: (id: string, patch: Partial<ServiceRadius>) => void;
    onRemove: (id: string) => void;
    showRemove: boolean;
}) {
    useEffect(() => {
        const addr = row.address.trim();
        const km = Number(row.radiusKm);
        if (!addr || !Number.isFinite(km) || km < 1 || km > 100) {
            if (row.lat !== 0 || row.lng !== 0) onPatch(row.id, { lat: 0, lng: 0 });
            return;
        }
        const handle = window.setTimeout(() => {
            void geocodeApi({ address: addr, westernCapeOnly: true }).then((geo) => {
                if (!geo?.address || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
                    onPatch(row.id, { lat: 0, lng: 0 });
                    return;
                }
                const rounded = Math.min(100, Math.max(1, Math.round(km)));
                onPatch(row.id, { lat: geo.lat, lng: geo.lng, address: geo.address, radiusKm: rounded });
            });
        }, 450);
        return () => window.clearTimeout(handle);
    }, [row.address, row.radiusKm, row.id, onPatch]);

    return (
        <div className="flex flex-col gap-4 rounded-lg border border-border/75 p-4">
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor={`svc-addr-${row.id}`}>Centre address for this zone</RequiredLabel>
                <Input
                    id={`svc-addr-${row.id}`}
                    className="h-10 text-sm"
                    value={row.address}
                    onChange={(e) => onPatch(row.id, { address: e.target.value })}
                    onBlur={(e) => onPatch(row.id, { address: toTitleCaseWords(e.target.value) })}
                    placeholder="Street, suburb, city"
                />
            </div>
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor={`svc-km-${row.id}`}>Radius (km)</RequiredLabel>
                <Input
                    id={`svc-km-${row.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    className="h-10 text-sm"
                    value={String(row.radiusKm)}
                    onChange={(e) =>
                        onPatch(row.id, {
                            radiusKm: Math.min(100, Math.max(1, Number(e.target.value.replace(/[^\d.]/g, '')) || 1)),
                        })
                    }
                />
            </div>
            {row.lat !== 0 && row.lng !== 0 ? (
                <p className="text-xs text-muted-foreground">
                    Mapped — {row.radiusKm} km from {row.address}
                </p>
            ) : (
                <p className="text-xs text-muted-foreground">
                    Enter a Western Cape address we can place on the map.
                </p>
            )}
            {showRemove ? (
                <Button type="button" variant="ghost" className="h-9 w-full" onClick={() => onRemove(row.id)}>
                    Remove this zone
                </Button>
            ) : null}
        </div>
    );
}

export function StepServiceAreas() {
    const { radii, setRadii, patchRadiusRow, maxRadii } = useWizard();
    const handleMapSelect = useCallback(() => {}, []);
    const selectedId = radii[0]?.id ?? null;

    const addZone = () => {
        if (radii.length >= maxRadii) return;
        setRadii([
            ...radii,
            { id: createClientId(), address: '', lat: 0, lng: 0, radiusKm: DEFAULT_SERVICE_RADIUS_KM },
        ]);
    };

    const removeZone = (id: string) => {
        if (radii.length <= 1) return;
        setRadii(radii.filter((r) => r.id !== id));
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Where you work"
                description={
                    maxRadii === 1
                        ? 'Set the centre of your operating area and how far you travel for jobs.'
                        : `Add up to ${maxRadii} zones (e.g. different suburbs or crews). Each needs a centre address and radius.`
                }
            />
            <div className="w-full max-w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                <ServiceRadiusMap
                    radii={radii.filter((r) => r.lat !== 0 && r.lng !== 0)}
                    selectedId={selectedId}
                    onSelect={handleMapSelect}
                />
                <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                    {radii.some((r) => r.lat !== 0 && r.lng !== 0)
                        ? radii
                              .filter((r) => r.lat !== 0 && r.lng !== 0)
                              .map((r) => (
                                  <span key={r.id}>
                                      {r.address} — {r.radiusKm} km
                                  </span>
                              ))
                        : 'Enter valid addresses to preview coverage.'}
                </div>
            </div>
            <div className="flex flex-col gap-6">
                {radii.map((row) => (
                    <ServiceRadiusRowEditor
                        key={row.id}
                        row={row}
                        onPatch={patchRadiusRow}
                        onRemove={removeZone}
                        showRemove={maxRadii > 1 && radii.length > 1}
                    />
                ))}
                {maxRadii > 1 && radii.length < maxRadii ? (
                    <Button type="button" variant="secondary" className="h-10 w-full" onClick={addZone}>
                        Add another zone ({radii.length} of {maxRadii})
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
