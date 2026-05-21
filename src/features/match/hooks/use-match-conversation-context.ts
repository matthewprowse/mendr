import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/auth/supabase';
import {
    fetchConversationDiagnosis,
    peekCachedConversationDiagnosis,
} from '@/lib/diagnosis/diagnoses-api';
import { readMatchTradeContextStorage } from '@/lib/diagnosis/match-trade-context';
import { geocodeApi } from '../api/client';
import type { MatchLocation } from '../contracts';
import { useAuth } from '@/context/auth-context';

function isCoordinateLikeAddress(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^\s*-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?\s*$/.test(trimmed);
}

export function useMatchConversationContext(conversationId: string) {
    const { user } = useAuth();
    const userIdRef = useRef<string | null>(user?.id ?? null);
    useEffect(() => {
        userIdRef.current = user?.id ?? null;
    }, [user?.id]);
    const [userLocation, setUserLocation] = useState<MatchLocation | null>(null);
    const [addressInput, setAddressInput] = useState('');

    const resolveTradeContext = useCallback(async (): Promise<{ trade: string; trade_detail: string }> => {
        if (!conversationId) return { trade: '', trade_detail: '' };

        const fromStorage = (): { trade: string; trade_detail: string } | null =>
            readMatchTradeContextStorage(conversationId);

        const fromDiagnosis = (d: unknown): { trade: string; trade_detail: string } | null => {
            if (!d || typeof d !== 'object') return null;
            const o = d as Record<string, unknown>;
            const t = typeof o.trade === 'string' ? o.trade.trim() : '';
            const tdRaw = typeof o.trade_detail === 'string' ? o.trade_detail.trim() : '';
            const td = tdRaw || t;
            if (t && t.toLowerCase() !== 'n/a') return { trade: t, trade_detail: td };
            return null;
        };

        const peekRow = peekCachedConversationDiagnosis(conversationId);
        if (peekRow?.diagnosis != null) {
            const parsed = fromDiagnosis(peekRow.diagnosis);
            if (parsed) return parsed;
        }

        let api: Awaited<ReturnType<typeof fetchConversationDiagnosis>>;
        let parsedFromApi = false;
        try {
            api = await fetchConversationDiagnosis(conversationId);
            if (api.ok && api.data?.diagnosis != null) {
                const parsed = fromDiagnosis(api.data.diagnosis);
                if (parsed) {
                    parsedFromApi = true;
                    return parsed;
                }
            }
        } catch {
            api = { ok: false, status: 0, error: 'unknown' };
        }

        // Fall back to direct Supabase whenever API parsing didn't produce a usable
        // trade context (covers network drops + auth/session/API edge cases).
        if (!parsedFromApi) {
            try {
                const { data, error } = await (supabase as any)
                    .from('diagnoses')
                    .select('diagnosis')
                    .eq('id', conversationId)
                    .maybeSingle();

                if (!error && data?.diagnosis) {
                    const parsed = fromDiagnosis(data.diagnosis);
                    if (parsed) return parsed;
                }
            } catch {
                // fall through to session snapshot
            }
        }

        const fallback = fromStorage();
        if (fallback) return fallback;

        return { trade: '', trade_detail: '' };
    }, [conversationId]);

    const persistConversationLocation = useCallback(
        async (loc: MatchLocation) => {
            if (!conversationId) return;
            try {
                const res = await fetch('/api/diagnoses/location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: conversationId,
                        customer_lat: loc.lat,
                        customer_lng: loc.lng,
                        customer_address: loc.address ?? '',
                    }),
                });
                if (res.ok) return;
            } catch {
                // try direct client write below
            }
            try {
                await (supabase as any).from('diagnoses').upsert({
                    id: conversationId,
                    customer_lat: loc.lat,
                    customer_lng: loc.lng,
                    customer_address: loc.address,
                    updated_at: new Date().toISOString(),
                    ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
                });
            } catch {
                // ignore — map still works with in-memory location
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
                { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
            );
        }).catch(() => null);
        if (!coords) return null;
        return { lat: coords.latitude, lng: coords.longitude };
    }, []);

    const reverseGeocodeLatLng = useCallback(async (lat: number, lng: number): Promise<string> => {
        const geo = await geocodeApi({ lat, lng, westernCapeOnly: true });
        return typeof geo?.address === 'string' ? geo.address : '';
    }, []);

    const ensureLocation = useCallback(async () => {
        if (!conversationId) return null;

        const applyRow = async (data: {
            customer_lat?: number | null | undefined;
            customer_lng?: number | null | undefined;
            customer_address?: string | null;
        }) => {
            if (
                typeof data.customer_lat !== 'number' ||
                typeof data.customer_lng !== 'number' ||
                Number.isNaN(data.customer_lat) ||
                Number.isNaN(data.customer_lng)
            ) {
                return null;
            }
            const storedAddress = typeof data.customer_address === 'string' ? data.customer_address : '';
            const shouldResolveAddress = !storedAddress.trim() || isCoordinateLikeAddress(storedAddress);
            const resolvedAddress = shouldResolveAddress
                ? await reverseGeocodeLatLng(data.customer_lat, data.customer_lng)
                : storedAddress;
            if (!resolvedAddress.trim()) {
                return null;
            }
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
        };

        const peekRow = peekCachedConversationDiagnosis(conversationId);
        if (peekRow) {
            const loc = await applyRow(peekRow);
            if (loc) return loc;
        }

        let api: Awaited<ReturnType<typeof fetchConversationDiagnosis>>;
        try {
            api = await fetchConversationDiagnosis(conversationId);
            if (api.ok && api.data) {
                const loc = await applyRow(api.data);
                if (loc) return loc;
            }
        } catch {
            api = { ok: false, status: 0, error: 'unknown' };
        }

        const networkOnlyFailure = api.ok === false && api.status === 0;
        if (networkOnlyFailure) {
            try {
                const { data } = await (supabase as any)
                    .from('diagnoses')
                    .select('customer_lat, customer_lng, customer_address')
                    .eq('id', conversationId)
                    .maybeSingle();
                if (data) {
                    const loc = await applyRow(data);
                    if (loc) return loc;
                }
            } catch {
                // ignore
            }
        }

        const currentCoords = await getCurrentCoordinates();
        if (!currentCoords) return null;
        const resolvedAddress = await reverseGeocodeLatLng(currentCoords.lat, currentCoords.lng);
        if (!resolvedAddress.trim()) return null;
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
