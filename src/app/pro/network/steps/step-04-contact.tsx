'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWizard } from './wizard-context';
import { OptionalLabel, RequiredLabel, StepHeader } from './shared-ui';
import { PREFERRED_CONTACT_OPTIONS } from './types';
import { formatSaPhoneDisplay, normalizeWebsiteToHttps, shortenSaAddress } from './utils';

type Suggestion = { placeId: string; mainText: string; secondaryText: string };
const MAX_SUGGESTIONS = 3;

export function StepContact() {
    const { data, patch } = useWizard();
    const websiteDisplay = useMemo(
        () => (data.website || '').replace(/^https?:\/\//i, '').replace(/\/+$/g, ''),
        [data.website]
    );

    // Business-address autocomplete — same approach as the homeowner "add address"
    // page (settings/addresses): AutocompleteService.getPlacePredictions for a
    // custom suggestions list, PlacesService.getDetails to resolve the chosen one.
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autocompleteServiceRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placesServiceRef = useRef<any>(null);
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
                /* silent — manual typing + geocode-on-continue still works */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleAddressChange = useCallback(
        (value: string) => {
            patch({ address: value });
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
        },
        [patch]
    );

    const handleSelectSuggestion = useCallback(
        (s: Suggestion) => {
            setSuggestions([]);
            const fallback = [s.mainText, s.secondaryText].filter(Boolean).join(', ');
            const service = placesServiceRef.current;
            if (!service) {
                patch({ address: fallback });
                return;
            }
            service.getDetails(
                { placeId: s.placeId, fields: ['formatted_address'] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (place: any, status: string) => {
                    const resolved = status === 'OK' && place?.formatted_address ? place.formatted_address : fallback;
                    patch({ address: shortenSaAddress(resolved) });
                }
            );
        },
        [patch]
    );

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Contact Details"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="address">Business Address</RequiredLabel>
                    <div className="flex flex-col gap-2">
                        <Input
                            id="address"
                            autoComplete="off"
                            className="h-10 text-sm"
                            value={data.address}
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
                                            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
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
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="phone">Phone</RequiredLabel>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-10 text-sm"
                        value={data.phone}
                        onChange={(e) => patch({ phone: formatSaPhoneDisplay(e.target.value) })}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <Checkbox
                        id="whatsapp"
                        checked={data.whatsappAvailable}
                        onCheckedChange={(checked) => patch({ whatsappAvailable: Boolean(checked) })}
                    />
                    <label htmlFor="whatsapp" className="text-sm leading-relaxed text-foreground">
                        This number is on WhatsApp and can receive lead messages.
                    </label>
                </div>

                <div className="flex flex-col gap-3">
                    <OptionalLabel htmlFor="preferredContactChannel">Preferred Contact Channel</OptionalLabel>
                    <Select
                        value={data.preferredContactChannel}
                        onValueChange={(v) => patch({ preferredContactChannel: v })}
                    >
                        <SelectTrigger
                            id="preferredContactChannel"
                            className="h-10 min-h-10 w-full data-[size=default]:h-10"
                        >
                            <SelectValue placeholder="How should we send you leads?" />
                        </SelectTrigger>
                        <SelectContent>
                            {PREFERRED_CONTACT_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-3">
                    <OptionalLabel htmlFor="website">Website</OptionalLabel>
                    <Input
                        id="website"
                        className="h-10 text-sm"
                        value={websiteDisplay}
                        onChange={(e) => {
                            const remainder = e.target.value.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
                            patch({ website: remainder ? normalizeWebsiteToHttps(remainder) : '' });
                        }}
                        placeholder="example.com"
                    />
                </div>
            </div>
        </div>
    );
}
