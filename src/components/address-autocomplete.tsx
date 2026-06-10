'use client';

/**
 * Google Places address input that matches the Settings > Addresses pattern
 * exactly: an Input followed by an inline suggestions list that flows below it
 * (a 3-row skeleton while fetching, then selectable rows with a Separator
 * between them). South Africa only. Calls `onSelect` with the resolved address
 * and coordinates once the user picks a suggestion.
 *
 * Renders a Fragment (Input + suggestions) so it drops straight into a
 * `flex flex-col gap-3` field block alongside its Label, keeping the same
 * spacing as Settings.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export type SelectedPlace = { address: string; lat: number; lng: number };

type Suggestion = { placeId: string; mainText: string; secondaryText: string };

const MAX_SUGGESTIONS = 3;

export function AddressAutocomplete({
    id,
    value,
    onChange,
    onSelect,
    disabled,
    autoFocus,
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onSelect: (place: SelectedPlace) => void;
    disabled?: boolean;
    autoFocus?: boolean;
}) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [fetching, setFetching] = useState(false);

    const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
    const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
    const placesNodeRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
        if (!apiKey || typeof window === 'undefined') return;
        let cancelled = false;
        void (async () => {
            try {
                ensureGoogleMapsLoaderOptions(apiKey);
                await importLibrary('places');
                if (cancelled || !window.google?.maps) return;
                autocompleteServiceRef.current =
                    new window.google.maps.places.AutocompleteService();
                if (!placesNodeRef.current) {
                    placesNodeRef.current = document.createElement('div');
                }
                placesServiceRef.current = new window.google.maps.places.PlacesService(
                    placesNodeRef.current
                );
            } catch {
                /* silent — input still works as a plain text field */
            }
        })();
        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const handleChange = useCallback(
        (next: string) => {
            onChange(next);
            setSuggestions([]);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (!next.trim() || next.length < 3) return;
            debounceRef.current = setTimeout(() => {
                const service = autocompleteServiceRef.current;
                if (!service) return;
                setFetching(true);
                service.getPlacePredictions(
                    { input: next, componentRestrictions: { country: 'za' } },
                    (predictions, status) => {
                        setFetching(false);
                        if (status === 'OK' && predictions) {
                            setSuggestions(
                                predictions.slice(0, MAX_SUGGESTIONS).map((p) => ({
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
        },
        [onChange]
    );

    const handleSelect = useCallback(
        (s: Suggestion) => {
            const service = placesServiceRef.current;
            setSuggestions([]);
            if (!service) return;
            service.getDetails(
                { placeId: s.placeId, fields: ['formatted_address', 'geometry'] },
                (place, status) => {
                    if (status !== 'OK' || !place) return;
                    const address = place.formatted_address ?? s.mainText;
                    const lat = place.geometry?.location?.lat();
                    const lng = place.geometry?.location?.lng();
                    onChange(address);
                    if (lat != null && lng != null) {
                        onSelect({ address, lat, lng });
                    }
                }
            );
        },
        [onChange, onSelect]
    );

    return (
        <Fragment>
            <Input
                id={id}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                disabled={disabled}
                autoComplete="off"
                autoFocus={autoFocus}
            />
            {fetching ? (
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
                                onClick={() => handleSelect(s)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleSelect(s);
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
        </Fragment>
    );
}
