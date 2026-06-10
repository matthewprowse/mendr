'use client';

/**
 * Single typed fetcher for `/pro/[id]`.
 *
 * Replaces the legacy `useProProvider` hook (which read `providers` directly
 * via the public Supabase client and surfaced only a subset of fields). This
 * hook hits the typed `/api/providers/[id]` endpoint, which sanitises prose
 * fields, joins certifications + gallery thumbnails, and triggers a
 * background re-enrichment when CSS/HTML leakage is detected on read.
 *
 * When the server passes `initial`, the first client fetch is skipped. Fetches
 * use an 8s timeout so a stalled serverless function cannot leave skeletons up
 * indefinitely.
 */

import { startTransition, useEffect, useState } from 'react';
import type { ContractorProfile } from '@/features/match/contracts';

export type UseContractorReturn = {
    profile: ContractorProfile | null;
    isLoading: boolean;
    error: string | null;
    leakDetected: boolean;
};

export type ContractorHydratePayload = {
    fetchKey: string;
    profile: ContractorProfile;
    leakDetected: boolean;
};

export type UseContractorOptions = {
    initial?: ContractorHydratePayload | null;
    initialServerError?: string | null;
    ssrFetchKey?: string | null;
};

type ApiResponse = {
    provider?: ContractorProfile;
    leakDetected?: boolean;
    error?: string;
};

const FETCH_TIMEOUT_MS = 8000;

export function useContractor(
    idOrPlaceId: string,
    options?: UseContractorOptions
): UseContractorReturn {
    const initial = options?.initial ?? null;
    const initialServerError = options?.initialServerError ?? null;
    const ssrFetchKey = options?.ssrFetchKey ?? null;

    const ssrProfileMatch = Boolean(
        initial && initial.fetchKey === idOrPlaceId && initial.profile
    );
    const ssrErrorMatch = Boolean(
        initialServerError && ssrFetchKey === idOrPlaceId && !ssrProfileMatch
    );

    const [profile, setProfile] = useState<ContractorProfile | null>(() =>
        initial && initial.fetchKey === idOrPlaceId && initial.profile ? initial.profile : null
    );
    const [isLoading, setIsLoading] = useState<boolean>(() => {
        if (!idOrPlaceId) return false;
        if (ssrProfileMatch || ssrErrorMatch) return false;
        return true;
    });
    const [error, setError] = useState<string | null>(() =>
        ssrErrorMatch && initialServerError ? initialServerError : null
    );
    const [leakDetected, setLeakDetected] = useState<boolean>(() =>
        initial && initial.fetchKey === idOrPlaceId && initial.profile
            ? Boolean(initial.leakDetected)
            : false
    );

    useEffect(() => {
        if (!idOrPlaceId) {
            startTransition(() => {
                setProfile(null);
                setIsLoading(false);
                setError(null);
                setLeakDetected(false);
            });
            return;
        }

        if (initial && initial.fetchKey === idOrPlaceId && initial.profile) {
            startTransition(() => {
                setProfile(initial.profile);
                setLeakDetected(Boolean(initial.leakDetected));
                setError(null);
                setIsLoading(false);
            });
            return;
        }

        if (initialServerError && ssrFetchKey === idOrPlaceId) {
            startTransition(() => {
                setProfile(null);
                setLeakDetected(false);
                setError(initialServerError);
                setIsLoading(false);
            });
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
        const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

        async function load(currentId: string) {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/providers/${encodeURIComponent(currentId)}`, {
                    signal: combinedSignal,
                    headers: { Accept: 'application/json' },
                });
                if (!res.ok) {
                    if (cancelled) return;
                    setProfile(null);
                    setLeakDetected(false);
                    setError(res.status === 404 ? 'Provider not found' : `Request failed (${res.status})`);
                    return;
                }
                const json = (await res.json()) as ApiResponse;
                if (cancelled) return;
                if (json.provider) {
                    setProfile(json.provider);
                    setLeakDetected(Boolean(json.leakDetected));
                    setError(null);
                } else {
                    setProfile(null);
                    setLeakDetected(false);
                    setError(json.error ?? 'Provider not found');
                }
            } catch (err) {
                if (cancelled) return;
                if (err instanceof DOMException && err.name === 'TimeoutError') {
                    setProfile(null);
                    setLeakDetected(false);
                    setError('Request timed out. Please try again.');
                    return;
                }
                if (err instanceof DOMException && err.name === 'AbortError') {
                    return;
                }
                setProfile(null);
                setLeakDetected(false);
                setError(err instanceof Error ? err.message : 'Network error');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void load(idOrPlaceId);

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [idOrPlaceId, initial, initialServerError, ssrFetchKey]);

    return { profile, isLoading, error, leakDetected };
}
