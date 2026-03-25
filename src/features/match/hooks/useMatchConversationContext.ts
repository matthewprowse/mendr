import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { geocodeApi } from '../api/client';
import type { MatchLocation } from '../contracts';

function isCoordinateLikeAddress(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^\s*-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?\s*$/.test(trimmed);
}

export function useMatchConversationContext(conversationId: string) {
    const [userLocation, setUserLocation] = useState<MatchLocation | null>(null);
    const [addressInput, setAddressInput] = useState('');

    const resolveTradeContext = useCallback(async (): Promise<{ trade: string; trade_detail: string }> => {
        if (!conversationId) return { trade: '', trade_detail: '' };
        try {
            const { data } = await (supabase as any)
                .from('conversations')
                .select('diagnosis')
                .eq('id', conversationId)
                .maybeSingle();
            const d = data?.diagnosis;
            const t = typeof d?.trade === 'string' ? d.trade.trim() : '';
            const tdRaw = typeof d?.trade_detail === 'string' ? d.trade_detail.trim() : '';
            const td = tdRaw || t;
            return { trade: t, trade_detail: td };
        } catch {
            return { trade: '', trade_detail: '' };
        }
    }, [conversationId]);

    const persistConversationLocation = useCallback(
        async (loc: MatchLocation) => {
            if (!conversationId) return;
            try {
                await (supabase as any).from('conversations').upsert({
                    id: conversationId,
                    customer_lat: loc.lat,
                    customer_lng: loc.lng,
                    customer_address: loc.address,
                    updated_at: new Date().toISOString(),
                });
            } catch {
                // ignore
            }
        },
        [conversationId]
    );

    const getCurrentCoordinates = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
            if (!navigator.geolocation) reject(new Error('Geolocation not supported'));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos.coords),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
            );
        }).catch(() => null);
        if (!coords) return null;
        return { lat: coords.latitude, lng: coords.longitude };
    }, []);

    const reverseGeocodeLatLng = useCallback(async (lat: number, lng: number): Promise<string> => {
        const geo = await geocodeApi({ lat, lng });
        return typeof geo?.address === 'string' ? geo.address : '';
    }, []);

    const ensureLocation = useCallback(async () => {
        if (!conversationId) return null;
        try {
            const { data } = await (supabase as any)
                .from('conversations')
                .select('customer_lat, customer_lng, customer_address')
                .eq('id', conversationId)
                .maybeSingle();
            if (
                data &&
                typeof data.customer_lat === 'number' &&
                typeof data.customer_lng === 'number' &&
                !Number.isNaN(data.customer_lat) &&
                !Number.isNaN(data.customer_lng)
            ) {
                const storedAddress = typeof data.customer_address === 'string' ? data.customer_address : '';
                const shouldResolveAddress = !storedAddress.trim() || isCoordinateLikeAddress(storedAddress);
                const resolvedAddress = shouldResolveAddress
                    ? await reverseGeocodeLatLng(data.customer_lat, data.customer_lng)
                    : storedAddress;
                const loc = {
                    lat: data.customer_lat as number,
                    lng: data.customer_lng as number,
                    address: resolvedAddress || '',
                };
                setUserLocation(loc);
                setAddressInput(loc.address || '');
                if (shouldResolveAddress && resolvedAddress) {
                    await persistConversationLocation(loc);
                }
                return loc;
            }
        } catch {
            // ignore
        }

        const currentCoords = await getCurrentCoordinates();
        if (!currentCoords) return null;
        const resolvedAddress = await reverseGeocodeLatLng(currentCoords.lat, currentCoords.lng);
        const loc = {
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            address: resolvedAddress,
        };
        setUserLocation(loc);
        setAddressInput(loc.address || '');
        await persistConversationLocation(loc);
        return loc;
    }, [
        conversationId,
        getCurrentCoordinates,
        persistConversationLocation,
        reverseGeocodeLatLng,
    ]);

    return {
        userLocation,
        setUserLocation,
        addressInput,
        setAddressInput,
        resolveTradeContext,
        ensureLocation,
        getCurrentCoordinates,
        reverseGeocodeLatLng,
        persistConversationLocation,
    };
}
