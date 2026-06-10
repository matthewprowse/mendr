/**
 * Tests for `useSavedProvider` — the save/unsave toggle on a provider profile.
 *
 * It hydrates the initial saved state from a GET, and `toggle()` POSTs to flip
 * it. Guards: no fetch fires when unauthenticated or when there's no provider
 * id; toggle returns null (and leaves state untouched) on a non-OK response or
 * a missing id. MSW intercepts the two endpoints.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import { useSavedProvider } from '@/app/pro/hooks/use-saved-provider';

const PROVIDER = 'prov-1';

let getCalls = 0;
beforeEach(() => {
    getCalls = 0;
});

function stubGet(saved: boolean) {
    server.use(
        http.get('/api/account/saved-providers', () => {
            getCalls += 1;
            return HttpResponse.json({ saved });
        }),
    );
}

describe('useSavedProvider — hydration', () => {
    it('does not fetch and stays unsaved when unauthenticated', async () => {
        stubGet(true);
        const { result } = renderHook(() => useSavedProvider(PROVIDER, false));
        // Give the effect a tick; it should early-return without a fetch.
        await Promise.resolve();
        expect(result.current.saved).toBe(false);
        expect(getCalls).toBe(0);
    });

    it('does not fetch when there is no provider id', async () => {
        stubGet(true);
        const { result } = renderHook(() => useSavedProvider(null, true));
        await Promise.resolve();
        expect(result.current.saved).toBe(false);
        expect(getCalls).toBe(0);
    });

    it('hydrates saved=true from the GET when authenticated', async () => {
        stubGet(true);
        const { result } = renderHook(() => useSavedProvider(PROVIDER, true));
        await waitFor(() => expect(result.current.saved).toBe(true));
        expect(getCalls).toBe(1);
    });
});

describe('useSavedProvider — toggle', () => {
    it('flips saved and returns the new value on a successful POST', async () => {
        stubGet(false);
        server.use(
            http.post('/api/account/saved-providers', () => HttpResponse.json({ saved: true })),
        );
        const { result } = renderHook(() => useSavedProvider(PROVIDER, true));
        await waitFor(() => expect(result.current.saved).toBe(false));

        let returned: boolean | null = null;
        await act(async () => {
            returned = await result.current.toggle();
        });
        expect(returned).toBe(true);
        expect(result.current.saved).toBe(true);
        expect(result.current.loading).toBe(false);
    });

    it('returns null without a request when there is no provider id', async () => {
        const { result } = renderHook(() => useSavedProvider(null, true));
        let returned: boolean | null = false as boolean | null;
        await act(async () => {
            returned = await result.current.toggle();
        });
        expect(returned).toBeNull();
    });

    it('returns null and leaves state unchanged on a non-OK POST', async () => {
        stubGet(true);
        server.use(
            http.post('/api/account/saved-providers', () => new HttpResponse(null, { status: 500 })),
        );
        const { result } = renderHook(() => useSavedProvider(PROVIDER, true));
        await waitFor(() => expect(result.current.saved).toBe(true));

        let returned: boolean | null = true as boolean | null;
        await act(async () => {
            returned = await result.current.toggle();
        });
        expect(returned).toBeNull();
        expect(result.current.saved).toBe(true);
    });
});
