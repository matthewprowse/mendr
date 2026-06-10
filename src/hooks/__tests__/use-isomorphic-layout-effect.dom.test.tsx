/**
 * Phase 5 — useIsomorphicLayoutEffect.
 *
 * In jsdom (window defined) it aliases React.useLayoutEffect, which runs
 * synchronously after render. We assert the effect actually fires.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';

describe('useIsomorphicLayoutEffect', () => {
    it('is a callable effect hook in the jsdom environment', () => {
        expect(typeof useIsomorphicLayoutEffect).toBe('function');
    });

    it('runs the effect callback on mount', () => {
        const effect = vi.fn();
        renderHook(() => useIsomorphicLayoutEffect(effect, []));
        expect(effect).toHaveBeenCalledTimes(1);
    });

    it('runs the cleanup on unmount', () => {
        const cleanup = vi.fn();
        const { unmount } = renderHook(() => useIsomorphicLayoutEffect(() => cleanup, []));
        expect(cleanup).not.toHaveBeenCalled();
        unmount();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});
