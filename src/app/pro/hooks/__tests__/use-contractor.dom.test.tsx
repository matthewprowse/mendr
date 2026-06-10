/**
 * Tests for `useContractor` — the typed fetcher behind a `/pro/[id]` profile.
 *
 * Pinned: SSR hydration short-circuits the client fetch; a fresh id triggers a
 * fetch that maps {provider} → profile; HTTP errors map to friendly messages
 * (404 → "Provider not found", other → "Request failed (n)"); a JSON body with
 * no provider surfaces its `error`; an empty id renders idle, not loading.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import { useContractor } from '@/app/pro/hooks/use-contractor';
import type { ContractorProfile } from '@/features/match/contracts';

const profile = (name: string) => ({ id: 'p1', name }) as unknown as ContractorProfile;

describe('useContractor — SSR hydration', () => {
    it('uses the initial profile and skips the fetch when fetchKey matches', async () => {
        let fetched = false;
        server.use(
            http.get('/api/providers/:id', () => {
                fetched = true;
                return HttpResponse.json({ provider: profile('from-network') });
            }),
        );
        const { result } = renderHook(() =>
            useContractor('p1', {
                initial: { fetchKey: 'p1', profile: profile('from-ssr'), leakDetected: false },
            }),
        );
        expect(result.current.isLoading).toBe(false);
        expect(result.current.profile?.name).toBe('from-ssr');
        await Promise.resolve();
        expect(fetched).toBe(false);
    });

    it('renders idle (not loading) when the id is empty', () => {
        const { result } = renderHook(() => useContractor(''));
        expect(result.current.isLoading).toBe(false);
        expect(result.current.profile).toBeNull();
    });

    it('surfaces an initial server error when ssrFetchKey matches', () => {
        const { result } = renderHook(() =>
            useContractor('p1', { initialServerError: 'boom', ssrFetchKey: 'p1' }),
        );
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe('boom');
    });
});

describe('useContractor — client fetch', () => {
    it('maps a successful {provider} response to the profile', async () => {
        server.use(
            http.get('/api/providers/:id', () =>
                HttpResponse.json({ provider: profile('Dlamini Plumbing'), leakDetected: true }),
            ),
        );
        const { result } = renderHook(() => useContractor('p1'));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.profile?.name).toBe('Dlamini Plumbing');
        expect(result.current.leakDetected).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it('maps a 404 to "Provider not found"', async () => {
        server.use(
            http.get('/api/providers/:id', () => new HttpResponse(null, { status: 404 })),
        );
        const { result } = renderHook(() => useContractor('missing'));
        await waitFor(() => expect(result.current.error).toBe('Provider not found'));
        expect(result.current.profile).toBeNull();
    });

    it('maps a non-404 error status to "Request failed (n)"', async () => {
        server.use(
            http.get('/api/providers/:id', () => new HttpResponse(null, { status: 503 })),
        );
        const { result } = renderHook(() => useContractor('p1'));
        await waitFor(() => expect(result.current.error).toBe('Request failed (503)'));
    });

    it('surfaces the JSON error when the body has no provider', async () => {
        server.use(
            http.get('/api/providers/:id', () => HttpResponse.json({ error: 'Profile hidden' })),
        );
        const { result } = renderHook(() => useContractor('p1'));
        await waitFor(() => expect(result.current.error).toBe('Profile hidden'));
    });
});
