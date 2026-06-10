/**
 * Tests for analytics.ts — getSessionId, trackEvent
 *
 * The analytics module fires non-blocking events. We test the control-flow
 * branches (dev-mode gate, deduplication, fallback to fetch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Reset module registry between tests so env-var changes take effect
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Ensure dev analytics is off by default in test environment
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_ANALYTICS;
});

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_ANALYTICS;
});

describe('getSessionId', () => {
    it('returns "ssr" when window is undefined', async () => {
        // Simulate SSR: window is not defined
        const originalWindow = global.window;
        // @ts-expect-error: intentionally removing window
        delete global.window;
        const { getSessionId } = await import('../analytics');
        expect(getSessionId()).toBe('ssr');
        global.window = originalWindow;
    });

    it('returns a string session ID in browser context', async () => {
        const { getSessionId } = await import('../analytics');
        const id = getSessionId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });

    it('returns the same ID on subsequent calls (session persistence)', async () => {
        const { getSessionId } = await import('../analytics');
        const id1 = getSessionId();
        const id2 = getSessionId();
        expect(id1).toBe(id2);
    });
});

describe('trackEvent — dev mode gate', () => {
    it('does NOT fire in test/dev mode without NEXT_PUBLIC_ENABLE_DEV_ANALYTICS', async () => {
        // NODE_ENV=test and flag not set: early return, no fetch
        const fetchSpy = vi.spyOn(global, 'fetch');
        const { trackEvent } = await import('../analytics');
        trackEvent('welcome_start');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fires when NEXT_PUBLIC_ENABLE_DEV_ANALYTICS=1 is set', async () => {
        // With NEXT_PUBLIC_ENABLE_DEV_ANALYTICS=1, the gate is bypassed regardless of NODE_ENV
        process.env.NEXT_PUBLIC_ENABLE_DEV_ANALYTICS = '1';
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
        } as Response);
        // Remove sendBeacon to force the fetch path
        const origSendBeacon = navigator.sendBeacon;
        // @ts-expect-error: intentionally overriding
        navigator.sendBeacon = undefined;

        const { trackEvent } = await import('../analytics');
        trackEvent('welcome_start');

        // fetch should be called because the dev gate was bypassed
        expect(fetchSpy).toHaveBeenCalledWith(
            '/api/events',
            expect.objectContaining({ method: 'POST' }),
        );

        navigator.sendBeacon = origSendBeacon;
    });
});

describe('trackEvent — deduplication', () => {
    it('deduplicates identical events within the dedupe window', async () => {
        // Enable analytics so the gate is bypassed
        process.env.NEXT_PUBLIC_ENABLE_DEV_ANALYTICS = '1';

        vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
        navigator.sendBeacon = vi.fn().mockReturnValue(true);

        const { trackEvent } = await import('../analytics');
        trackEvent('match_view', { provider_id: 'p1' });
        trackEvent('match_view', { provider_id: 'p1' }); // same payload — should be deduplicated

        // sendBeacon should only be called once
        expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    });
});
