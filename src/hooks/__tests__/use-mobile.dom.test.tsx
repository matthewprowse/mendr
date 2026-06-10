/**
 * Tests for `useIsMobile`. It reports whether the viewport is below the 768px
 * breakpoint and stays in sync via a matchMedia change listener. jsdom doesn't
 * implement matchMedia, so we install a controllable stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-mobile';

type Listener = () => void;
let listeners: Listener[] = [];

function setViewport(width: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

beforeEach(() => {
    listeners = [];
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: window.innerWidth < 768,
        media: query,
        addEventListener: (_e: string, cb: Listener) => listeners.push(cb),
        removeEventListener: (_e: string, cb: Listener) => {
            listeners = listeners.filter((l) => l !== cb);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useIsMobile', () => {
    it('returns true for a narrow viewport', () => {
        setViewport(375);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(true);
    });

    it('returns false for a wide viewport', () => {
        setViewport(1280);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);
    });

    it('treats exactly the breakpoint (768) as desktop', () => {
        setViewport(768);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);
    });

    it('updates when the media query change event fires', () => {
        setViewport(1280);
        const { result } = renderHook(() => useIsMobile());
        expect(result.current).toBe(false);

        act(() => {
            setViewport(360);
            listeners.forEach((l) => l());
        });
        expect(result.current).toBe(true);
    });

    it('removes its listener on unmount', () => {
        setViewport(1280);
        const { unmount } = renderHook(() => useIsMobile());
        expect(listeners).toHaveLength(1);
        unmount();
        expect(listeners).toHaveLength(0);
    });
});
