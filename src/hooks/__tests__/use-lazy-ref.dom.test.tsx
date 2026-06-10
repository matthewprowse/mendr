/**
 * Phase 5 — useLazyRef.
 *
 * Initialises a ref exactly once from a factory, then keeps the same value
 * across renders (the factory must not run again).
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLazyRef } from '@/hooks/use-lazy-ref';

describe('useLazyRef', () => {
    it('initialises ref.current from the factory', () => {
        const { result } = renderHook(() => useLazyRef(() => ({ count: 0 })));
        expect(result.current.current).toEqual({ count: 0 });
    });

    it('runs the factory only once across re-renders', () => {
        const factory = vi.fn(() => ({ id: Math.random() }));
        const { result, rerender } = renderHook(() => useLazyRef(factory));
        const firstValue = result.current.current;
        rerender();
        rerender();
        expect(factory).toHaveBeenCalledTimes(1);
        expect(result.current.current).toBe(firstValue);
    });

    it('supports a falsy-but-non-null initial value', () => {
        const { result } = renderHook(() => useLazyRef(() => 0));
        expect(result.current.current).toBe(0);
    });
});
