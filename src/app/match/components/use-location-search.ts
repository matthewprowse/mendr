'use client';

import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { geocodeApi } from '@/features/match/api/client';
import type { MatchLocation, MatchProvider } from '@/features/match/contracts';
import { DEFAULT_SEARCH_RADIUS_METERS } from '@/app/match/components/enrichment-utils';

/**
 * Location search actions for the match page: geocode a typed address (or raw coordinates)
 * and resolve the device's current position, then persist the chosen location to the
 * conversation. Both reset the provider list/radius so the next location refresh refetches.
 */
export function useLocationSearch({
    conversationId,
    setIsUpdatingLocation,
    setIsLocatingUser,
    setIsLoading,
    setProviders,
    setCompanyIndex,
    setSearchRadiusMeters,
    lastProviderFetchKeyRef,
    setUserLocation,
    setAddressInput,
    persistConversationLocation,
    getCurrentCoordinates,
}: {
    conversationId: string;
    setIsUpdatingLocation: Dispatch<SetStateAction<boolean>>;
    setIsLocatingUser: Dispatch<SetStateAction<boolean>>;
    setIsLoading: Dispatch<SetStateAction<boolean>>;
    setProviders: (providers: MatchProvider[]) => void;
    setCompanyIndex: Dispatch<SetStateAction<number>>;
    setSearchRadiusMeters: Dispatch<SetStateAction<number>>;
    lastProviderFetchKeyRef: MutableRefObject<string>;
    setUserLocation: (location: MatchLocation | null) => void;
    setAddressInput: (value: string) => void;
    persistConversationLocation: (location: MatchLocation) => Promise<void>;
    getCurrentCoordinates: () => Promise<{ lat: number; lng: number } | null>;
}) {
    const updateLocationFromAddress = useCallback(
        async (address: string) => {
            if (!conversationId) return;
            const trimmed = address.trim();
            if (!trimmed) return;

            setIsUpdatingLocation(true);
            setIsLoading(true);
            setProviders([]);
            setCompanyIndex(1);
            setSearchRadiusMeters(DEFAULT_SEARCH_RADIUS_METERS);
            lastProviderFetchKeyRef.current = '';

            try {
                const coordMatch = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
                const isCoords = Boolean(coordMatch);

                const geo = await geocodeApi(
                    isCoords
                        ? {
                              lat: Number(coordMatch?.[1]),
                              lng: Number(coordMatch?.[2]),
                              westernCapeOnly: true,
                          }
                        : { address: trimmed, westernCapeOnly: true }
                );

                if (
                    !geo ||
                    typeof geo.lat !== 'number' ||
                    typeof geo.lng !== 'number' ||
                    !Number.isFinite(geo.lat) ||
                    !Number.isFinite(geo.lng) ||
                    (typeof geo.address !== 'string' && typeof geo.address !== 'undefined')
                ) {
                    toast.error(
                        geo?.error ||
                            'Please use an address in the Western Cape, South Africa.'
                    );
                    return;
                }

                const loc = {
                    lat: geo.lat as number,
                    lng: geo.lng as number,
                    address: typeof geo.address === 'string' ? geo.address : trimmed,
                };

                setUserLocation(loc);
                setAddressInput(loc.address);

                await persistConversationLocation(loc);
            } finally {
                setIsUpdatingLocation(false);
                setIsLoading(false);
            }
        },
        [conversationId, persistConversationLocation, setUserLocation]
    );

    const handleUseCurrentLocation = useCallback(async () => {
        setIsLocatingUser(true);
        setIsLoading(true);
        setSearchRadiusMeters(DEFAULT_SEARCH_RADIUS_METERS);
        lastProviderFetchKeyRef.current = '';
        try {
            const coords = await getCurrentCoordinates();
            if (!coords) {
                toast.error('Could not access your location. Please allow permission and try again.');
                return;
            }
            const geo = await geocodeApi({
                lat: coords.lat,
                lng: coords.lng,
                westernCapeOnly: true,
            });
            if (
                !geo ||
                typeof geo.address !== 'string' ||
                !geo.address.trim()
            ) {
                toast.error(
                    geo?.error ||
                        'Your current location appears to be outside the Western Cape.'
                );
                return;
            }
            const loc = { lat: coords.lat, lng: coords.lng, address: geo.address.trim() };
            setUserLocation(loc);
            setAddressInput(loc.address);
            await persistConversationLocation(loc);
        } finally {
            setIsLocatingUser(false);
            setIsLoading(false);
        }
    }, [
        getCurrentCoordinates,
        persistConversationLocation,
        setAddressInput,
        setUserLocation,
    ]);

    return { updateLocationFromAddress, handleUseCurrentLocation };
}
