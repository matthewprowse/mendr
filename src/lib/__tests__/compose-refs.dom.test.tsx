/**
 * Tests for compose-refs.ts — composeRefs, useComposedRefs
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { composeRefs, useComposedRefs } from '../compose-refs';

// ── composeRefs ───────────────────────────────────────────────────────────────

describe('composeRefs', () => {
    it('forwards a value to a RefObject', () => {
        const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
        const composed = composeRefs(ref);
        const div = document.createElement('div') as unknown as HTMLDivElement;
        composed(div);
        expect(ref.current).toBe(div);
    });

    it('forwards a value to a callback ref', () => {
        let captured: HTMLDivElement | null = null;
        const callbackRef = (el: HTMLDivElement | null) => { captured = el; };
        const composed = composeRefs(callbackRef);
        const div = document.createElement('div') as unknown as HTMLDivElement;
        composed(div);
        expect(captured).toBe(div);
    });

    it('forwards the value to both a RefObject and a callback ref', () => {
        const refObj = { current: null } as React.RefObject<HTMLDivElement | null>;
        let captured: HTMLDivElement | null = null;
        const callbackRef = (el: HTMLDivElement | null) => { captured = el; };
        const composed = composeRefs(refObj, callbackRef);
        const div = document.createElement('div') as unknown as HTMLDivElement;
        composed(div);
        expect(refObj.current).toBe(div);
        expect(captured).toBe(div);
    });

    it('works when one ref is null/undefined', () => {
        const refObj = { current: null } as React.RefObject<HTMLDivElement | null>;
        expect(() => {
            const composed = composeRefs(refObj, undefined);
            const div = document.createElement('div') as unknown as HTMLDivElement;
            composed(div);
        }).not.toThrow();
        // refObj should still be set
        const refObj2 = { current: null } as React.RefObject<HTMLDivElement | null>;
        const composed2 = composeRefs(null as never, refObj2);
        const div2 = document.createElement('div') as unknown as HTMLDivElement;
        composed2(div2);
        expect(refObj2.current).toBe(div2);
    });

    it('sets RefObject.current to null when node is null', () => {
        const refObj = { current: document.createElement('div') as unknown as HTMLDivElement };
        const composed = composeRefs(refObj);
        composed(null as unknown as HTMLDivElement);
        expect(refObj.current).toBeNull();
    });

    it('calls callback ref with null on cleanup', () => {
        let captured: HTMLDivElement | null = document.createElement('div') as unknown as HTMLDivElement;
        const callbackRef = (el: HTMLDivElement | null) => { captured = el; };
        const composed = composeRefs(callbackRef);
        composed(null as unknown as HTMLDivElement);
        expect(captured).toBeNull();
    });
});

// ── useComposedRefs ───────────────────────────────────────────────────────────

describe('useComposedRefs', () => {
    it('returns a stable callback ref function', () => {
        const refObj = React.createRef<HTMLDivElement>();
        const { result, rerender } = renderHook(() => useComposedRefs(refObj));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('forwards node to all refs', () => {
        const ref1 = React.createRef<HTMLDivElement>();
        const ref2 = React.createRef<HTMLDivElement>();
        const { result } = renderHook(() => useComposedRefs(ref1, ref2));
        const div = document.createElement('div') as unknown as HTMLDivElement;
        result.current(div);
        expect(ref1.current).toBe(div);
        expect(ref2.current).toBe(div);
    });
});
