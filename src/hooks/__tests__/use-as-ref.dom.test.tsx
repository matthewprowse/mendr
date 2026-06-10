/**
 * Phase 5 — useAsRef.
 *
 * Keeps a ref synchronised with the latest prop value via a layout effect, so a
 * stable callback can read fresh values without re-subscribing.
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAsRef } from '@/hooks/use-as-ref';

describe('useAsRef', () => {
    it('exposes the initial value through ref.current', () => {
        const { result } = renderHook(() => useAsRef('initial'));
        expect(result.current.current).toBe('initial');
    });

    it('updates ref.current when the prop changes', () => {
        const { result, rerender } = renderHook(({ value }) => useAsRef(value), {
            initialProps: { value: 1 },
        });
        expect(result.current.current).toBe(1);
        rerender({ value: 2 });
        expect(result.current.current).toBe(2);
    });

    it('returns a stable ref object across renders', () => {
        const { result, rerender } = renderHook(({ value }) => useAsRef(value), {
            initialProps: { value: 'a' },
        });
        const first = result.current;
        rerender({ value: 'b' });
        expect(result.current).toBe(first);
    });
});
