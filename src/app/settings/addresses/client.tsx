'use client';

/**
 * AddressesClient — manage saved addresses (read / add / edit / delete).
 *
 * Address input uses a custom Google Places suggestions list (AutocompleteService
 * + PlacesService.getDetails) — no native browser autocomplete dropdown.
 * Every saved address includes a verified formatted_address + lat/lng pair,
 * eliminating the geocoding step on the /start page.
 *
 * Add/edit is an inline section that lives directly in the page body —
 * H2 + Lorem ipsum sub + inputs + Save/Cancel — no Sheet/Dialog wrapper, no
 * Card. Toggled by the Add Address button at the foot of the list or by
 * tapping an existing row to edit. The Google Places suggestions popover
 * stays absolutely positioned beneath the address input so the Save button
 * doesn't get pushed down as results arrive.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, SquarePen, X } from 'lucide-react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { toast } from 'sonner';

export type SavedLocation = {
    id: string;
    label: string;
    address: string;
    lat?: number | null;
    lng?: number | null;
};

type SelectedPlace = { address: string; lat: number; lng: number };

type Suggestion = {
    placeId: string;
    mainText: string;
    secondaryText: string;
};

const MAX_LOCATIONS = 10;
const MAX_SUGGESTIONS = 3;

export default function AddressesClient({ initialLocations }: { initialLocations?: SavedLocation[] }) {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [locations, setLocations] = useState<SavedLocation[] | null>(initialLocations ?? null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newLabel, setNewLabel] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
    const [saving, setSaving] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [fetchingSuggestions, setFetchingSuggestions] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autocompleteServiceRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placesServiceRef = useRef<any>(null);
    const placesNodeRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (initialLocations !== undefined) return; // server already provided data
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch('/api/account/locations')
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((data: { locations: SavedLocation[] }) => {
                if (!cancelled) setLocations(data.locations ?? []);
            })
            .catch(() => {
                if (!cancelled) setLoadError('We could not load your addresses.');
            });
        return () => { cancelled = true; };
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    // Initialise Places services when the drawer opens
    useEffect(() => {
        if (!drawerOpen) return;
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
        return () => { cancelled = true; };
    }, [drawerOpen]);

    const handleAddressChange = useCallback((value: string) => {
        setNewAddress(value);
        setSelectedPlace(null);
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!value.trim() || value.length < 3) return;
        debounceRef.current = setTimeout(() => {
            const service = autocompleteServiceRef.current;
            if (!service) return;
            setFetchingSuggestions(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    }, []);

    const handleSelectSuggestion = useCallback((s: Suggestion) => {
        const service = placesServiceRef.current;
        setSuggestions([]);
        if (!service) return;
        service.getDetails(
            { placeId: s.placeId, fields: ['formatted_address', 'geometry'] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (place: any, status: string) => {
                if (status !== 'OK' || !place) return;
                const address: string = place.formatted_address ?? s.mainText;
                const lat: number | undefined = place.geometry?.location?.lat?.();
                const lng: number | undefined = place.geometry?.location?.lng?.();
                setNewAddress(address);
                if (lat != null && lng != null) {
                    setSelectedPlace({ address, lat, lng });
                }
            }
        );
    }, []);

    const openAdd = useCallback(() => {
        setDrawerMode('add');
        setEditingId(null);
        setNewLabel('');
        setNewAddress('');
        setSelectedPlace(null);
        setSuggestions([]);
        setDrawerOpen(true);
    }, []);

    const openEdit = useCallback((loc: SavedLocation) => {
        setDrawerMode('edit');
        setEditingId(loc.id);
        setNewLabel(loc.label);
        setNewAddress(loc.address);
        // Pre-confirm the place if coords exist so Save is enabled immediately
        // when the user opens the row without changing the address field.
        setSelectedPlace(
            loc.lat != null && loc.lng != null
                ? { address: loc.address, lat: loc.lat, lng: loc.lng }
                : null
        );
        setSuggestions([]);
        setDrawerOpen(true);
    }, []);

    const resetForm = useCallback(() => {
        setDrawerOpen(false);
        setDrawerMode('add');
        setEditingId(null);
        setNewLabel('');
        setNewAddress('');
        setSelectedPlace(null);
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    const handleSave = useCallback(async () => {
        if (saving) return;
        const label = newLabel.trim();
        if (!label) {
            toast.error('Add a name like "Home".');
            return;
        }
        if (!selectedPlace) {
            toast.error('Select an address from the suggestions.');
            return;
        }
        setSaving(true);
        try {
            if (drawerMode === 'edit' && editingId) {
                const res = await fetch('/api/account/locations', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingId,
                        label,
                        address: selectedPlace.address,
                        lat: selectedPlace.lat,
                        lng: selectedPlace.lng,
                    }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    location?: SavedLocation;
                    error?: string;
                };
                if (!res.ok || !data.location) {
                    throw new Error(data.error || 'Could not update address.');
                }
                setLocations((prev) =>
                    prev ? prev.map((l) => (l.id === editingId ? data.location! : l)) : prev
                );
                toast.success('Address updated.');
            } else {
                const res = await fetch('/api/account/locations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label,
                        address: selectedPlace.address,
                        lat: selectedPlace.lat,
                        lng: selectedPlace.lng,
                    }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    location?: SavedLocation;
                    error?: string;
                };
                if (!res.ok || !data.location) {
                    throw new Error(data.error || 'Could not save address.');
                }
                setLocations((prev) => (prev ? [...prev, data.location!] : [data.location!]));
                toast.success('Address saved.');
            }
            resetForm();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save address.');
        } finally {
            setSaving(false);
        }
    }, [saving, drawerMode, editingId, newLabel, selectedPlace, resetForm]);

    const handleDelete = useCallback(async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(
                `/api/account/locations?id=${encodeURIComponent(id)}`,
                { method: 'DELETE' }
            );
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(data.error || 'Could not delete address.');
            }
            setLocations((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
            toast.success('Address deleted.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete address.');
        } finally {
            setDeletingId(null);
        }
    }, []);

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => router.back()}
                >
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Addresses
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to manage your saved addresses.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/addresses">
                                            Log In
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isLoading = locations === null && !loadError;
    const atCap = locations !== null && locations.length >= MAX_LOCATIONS;

    // Inline editor section — H2 + Lorem ipsum sub + inputs + Save/Cancel.
    // Rendered directly inside the page body; no Sheet/Dialog wrapper, no
    // Card. Toggled by `drawerOpen`.
    const titleText = drawerMode === 'edit' ? 'Edit Address' : 'Add Address';
    const descriptionText =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    const editorSection = (
        <div className="flex w-full flex-col gap-6">
            <div className="flex w-full flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">
                    {titleText}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {descriptionText}
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="new-label">Name</Label>
                <Input
                    id="new-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    maxLength={50}
                    autoFocus
                />
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="new-address">Address</Label>
                <Input
                    id="new-address"
                    value={newAddress}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    autoComplete="off"
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
                                        <p className="text-sm font-medium leading-snug">
                                            {s.mainText}
                                        </p>
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

            <div className="flex flex-col gap-2">
                <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !newLabel.trim() || !selectedPlace}
                >
                    {saving
                        ? 'Saving…'
                        : drawerMode === 'edit'
                          ? 'Save Changes'
                          : 'Save Address'}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={resetForm}
                    disabled={saving}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">

                                {/* Page title */}
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Addresses
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {isLoading ? (
                                    /*
                                     * SKELETON — mirrors the saved-address row layout below.
                                     * Each row: size-12 icon · label + address text · pencil
                                     * button (size-8) · delete button (size-8).
                                     * ⚠️ If you change the row structure (icon size, number of
                                     * text lines, action buttons), update this skeleton too so
                                     * there is no layout shift when data arrives.
                                     */
                                    <div className="flex flex-col">
                                        {[0, 1, 2].map((i) => (
                                            <Fragment key={i}>
                                                {i > 0 ? <Separator /> : null}
                                                <div className="flex items-center gap-3 py-3">
                                                    <Skeleton className="size-12 shrink-0 rounded-md" />
                                                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                        <Skeleton className="h-3.5 w-1/4 rounded" />
                                                        <Skeleton className="h-3 w-3/4 rounded" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Skeleton className="size-8 shrink-0 rounded-md" />
                                                        <Skeleton className="size-8 shrink-0 rounded-md" />
                                                    </div>
                                                </div>
                                            </Fragment>
                                        ))}
                                    </div>
                                ) : null}

                                {loadError ? (
                                    <p className="text-center text-sm text-destructive">
                                        {loadError}
                                    </p>
                                ) : null}

                                {/* Address list — the label/address text area
                                    is the tap target for edit (matches the
                                    "row is the affordance" pattern used in
                                    the /settings landing, favourites, history,
                                    etc). The X on the right is delete and is
                                    its own button so taps don't collide. No
                                    pencil-style icon needed — the whole row
                                    being interactive does the job. */}
                                {locations && locations.length > 0 ? (
                                    <div className="flex flex-col">
                                        {locations.map((loc, index) => (
                                            <div key={loc.id}>
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
                                                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                        <p className="text-sm font-medium">
                                                            {loc.label}
                                                        </p>
                                                        <p className="line-clamp-1 text-xs text-muted-foreground">
                                                            {loc.address}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                            aria-label={`Edit ${loc.label}`}
                                                            onClick={() => openEdit(loc)}
                                                        >
                                                            <SquarePen size={16} />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                            aria-label="Delete address"
                                                            disabled={deletingId === loc.id}
                                                            onClick={() => void handleDelete(loc.id)}
                                                        >
                                                            {deletingId === loc.id ? (
                                                                <Spinner className="size-4" />
                                                            ) : (
                                                                <X size={16} strokeWidth={2.5} />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {locations !== null && locations.length === 0 && !loadError ? (
                                    <p className="text-center text-sm text-muted-foreground">
                                        No saved addresses yet.
                                    </p>
                                ) : null}

                                {/* Inline editor takes the place of the "Add
                                    Address" button when open. Closes by
                                    Cancel or successful save (both call
                                    resetForm). */}
                                {drawerOpen ? (
                                    editorSection
                                ) : !atCap && locations !== null ? (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full"
                                        onClick={openAdd}
                                    >
                                        Add Address
                                    </Button>
                                ) : null}

                                {atCap && !drawerOpen ? (
                                    <p className="text-center text-xs text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
