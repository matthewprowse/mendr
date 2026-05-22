'use client';

import {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@phosphor-icons/react';

/** Height of the fixed FlowStepHeader (h-16 = 64px). */
const HEADER_STOP_TOP_PX = 64;
/** "Half" sheet covers ~50% of a typical mobile viewport — preserves map visibility. */
const SHEET_HALF_HEIGHT_PX = 348;
/** "Peek" sheet only exposes the drag handle, count chip, and the first card. */
const SHEET_PEEK_HEIGHT_PX = 140;
const SHEET_MAX_RADIUS_PX = 16;
const SHEET_RADIUS_REDUCTION_DISTANCE_PX = 196;
/** Threshold expressed as a fraction of viewport height (top from top). */
const FULL_SNAP_THRESHOLD = 0.25;
const HALF_SNAP_THRESHOLD = 0.7;

const DESKTOP_SPLIT_MQ = '(min-width: 1024px)';

export type SheetMode = 'peek' | 'half' | 'full';

function subscribeDesktopSplit(onStoreChange: () => void) {
    if (typeof window === 'undefined') return () => {};
    const mq = window.matchMedia(DESKTOP_SPLIT_MQ);
    mq.addEventListener('change', onStoreChange);
    return () => mq.removeEventListener('change', onStoreChange);
}

function getDesktopSplitSnapshot() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(DESKTOP_SPLIT_MQ).matches;
}

export type MatchMapSheetLayoutProps = {
    onClose: () => void;
    headerRight: ReactNode;
    mapSlot: ReactNode;
    mapLoadingOverlay?: ReactNode;
    children: ReactNode;
    /** Scroll selected provider card into view when this key changes (e.g. placeId). */
    scrollToKey?: string | null;
    getScrollTarget?: () => HTMLElement | null;
    /** Increment (e.g. on map pin tap) to expand the sheet (defaults to `half` so map stays visible). */
    expandRequestId?: number;
    /**
     * Mode requested for the next `expandRequestId` increment. Defaults to `half`.
     * Set to `full` if you want a marker tap to fully expand instead of half.
     */
    expandToMode?: SheetMode;
    /** Optional count rendered as a chip on the drag handle when the sheet is in peek mode. */
    peekProviderCount?: number;
    /** Notified each time the sheet snaps to a different mode (peek/half/full). */
    onSheetModeChange?: (next: SheetMode, prev: SheetMode) => void;
};

export const MatchMapSheetLayout = forwardRef<HTMLDivElement, MatchMapSheetLayoutProps>(
    function MatchMapSheetLayout(
        {
            onClose,
            headerRight,
            mapSlot,
            mapLoadingOverlay,
            children,
            scrollToKey,
            getScrollTarget,
            expandRequestId = 0,
            expandToMode = 'half',
            peekProviderCount,
            onSheetModeChange,
        },
        ref
    ) {
        const isDesktopLayout = useSyncExternalStore(
            subscribeDesktopSplit,
            getDesktopSplitSnapshot,
            () => false
        );

        const [sheetMode, setSheetMode] = useState<SheetMode>('peek');
        const [sheetTopPx, setSheetTopPx] = useState<number | null>(null);
        const [isDraggingSheet, setIsDraggingSheet] = useState(false);
        const onSheetModeChangeRef = useRef(onSheetModeChange);
        useEffect(() => {
            onSheetModeChangeRef.current = onSheetModeChange;
        }, [onSheetModeChange]);
        const prevSheetModeRef = useRef<SheetMode>('peek');
        useEffect(() => {
            const prev = prevSheetModeRef.current;
            if (prev !== sheetMode) {
                onSheetModeChangeRef.current?.(sheetMode, prev);
                prevSheetModeRef.current = sheetMode;
            }
        }, [sheetMode]);

        const listScrollRef = useRef<HTMLDivElement | null>(null);
        /** Last `scrollToKey` we handled — ignore duplicate runs when only `getScrollTarget` identity changes. */
        const lastHandledScrollToKeyRef = useRef<string | null>(null);
        const sheetTopRef = useRef<number | null>(null);
        const contentTouchYRef = useRef<number | null>(null);
        const dragStartYRef = useRef(0);
        const dragStartTopRef = useRef(0);

        const setListRef = useCallback(
            (node: HTMLDivElement | null) => {
                listScrollRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
                }
            },
            [ref]
        );

        /**
         * Y-position of the sheet's top edge for each mode. `peek` exposes ~140px above the safe-area inset,
         * `half` exposes ~348px (preserves the map). `full` pins to the header stop.
         */
        const getTopForMode = useCallback((mode: SheetMode): number => {
            if (typeof window === 'undefined') return HEADER_STOP_TOP_PX;
            const vh = window.innerHeight;
            if (mode === 'full') return HEADER_STOP_TOP_PX;
            if (mode === 'half') return Math.max(HEADER_STOP_TOP_PX, vh - SHEET_HALF_HEIGHT_PX);
            return Math.max(HEADER_STOP_TOP_PX, vh - SHEET_PEEK_HEIGHT_PX);
        }, []);

        const getCollapsedTop = useCallback(() => getTopForMode('peek'), [getTopForMode]);

        const snapMode = useCallback(
            (mode: SheetMode) => {
                const next = getTopForMode(mode);
                setSheetMode(mode);
                setSheetTopPx(next);
                sheetTopRef.current = next;
            },
            [getTopForMode]
        );

        const setSheetTopFromScroll = useCallback(() => {
            if (typeof window === 'undefined') return;
            setSheetTopPx(getTopForMode(sheetMode));
        }, [getTopForMode, sheetMode]);

        useEffect(() => {
            sheetTopRef.current = sheetTopPx;
        }, [sheetTopPx]);

        useEffect(() => {
            if (typeof window === 'undefined' || isDesktopLayout) return;
            const raf = requestAnimationFrame(() => {
                setSheetTopFromScroll();
            });
            const onResize = () => {
                setSheetTopPx(getTopForMode(sheetMode));
            };
            window.addEventListener('resize', onResize);
            return () => {
                cancelAnimationFrame(raf);
                window.removeEventListener('resize', onResize);
            };
        }, [getTopForMode, isDesktopLayout, setSheetTopFromScroll, sheetMode]);

        useEffect(() => {
            if (!scrollToKey) {
                lastHandledScrollToKeyRef.current = null;
                return;
            }
            if (lastHandledScrollToKeyRef.current === scrollToKey) return;

            const prev = lastHandledScrollToKeyRef.current;
            lastHandledScrollToKeyRef.current = scrollToKey;

            // First selection on load: do not scrollIntoView (it offsets the sheet content). Reset list instead.
            if (prev === null) {
                const el = listScrollRef.current;
                if (el) el.scrollTop = 0;
                return;
            }

            window.setTimeout(() => {
                const el = getScrollTarget?.() ?? null;
                el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 420);
        }, [scrollToKey, getScrollTarget]);

        /**
         * Cycle the sheet on drag-handle tap. Tapping in peek goes to half (map still visible),
         * tapping in half goes to full, tapping in full collapses back to peek.
         */
        const cycleSheet = useCallback(() => {
            setSheetMode((current) => {
                const next: SheetMode =
                    current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek';
                const nextTop = getTopForMode(next);
                setSheetTopPx(nextTop);
                sheetTopRef.current = nextTop;
                return next;
            });
        }, [getTopForMode]);

        useEffect(() => {
            if (isDesktopLayout || !expandRequestId) return;
            const raf = requestAnimationFrame(() => {
                snapMode(expandToMode);
            });
            return () => cancelAnimationFrame(raf);
        }, [expandRequestId, expandToMode, isDesktopLayout, snapMode]);

        const handleSheetDragStart = useCallback(
            (clientY: number) => {
                dragStartYRef.current = clientY;
                dragStartTopRef.current = sheetTopPx ?? getCollapsedTop();
                setIsDraggingSheet(true);
            },
            [getCollapsedTop, sheetTopPx]
        );

        const handleSheetDragMove = useCallback(
            (clientY: number) => {
                if (!isDraggingSheet || typeof window === 'undefined') return;
                const deltaY = clientY - dragStartYRef.current;
                const minTop = HEADER_STOP_TOP_PX;
                const maxTop = getCollapsedTop();
                const nextTop = Math.min(maxTop, Math.max(minTop, dragStartTopRef.current + deltaY));
                setSheetTopPx(nextTop);
                sheetTopRef.current = nextTop;
            },
            [getCollapsedTop, isDraggingSheet]
        );

        const handleSheetDragEnd = useCallback(() => {
            if (!isDraggingSheet) return;
            setIsDraggingSheet(false);
            if (typeof window === 'undefined') return;
            const currentTop = sheetTopPx ?? getCollapsedTop();
            const vh = window.innerHeight;
            // Snap thresholds expressed as fractions of viewport height (top from top of screen).
            // top < 25% vh → snap to full. 25-70% vh → snap to half. else → peek.
            if (currentTop <= vh * FULL_SNAP_THRESHOLD) {
                snapMode('full');
            } else if (currentTop <= vh * HALF_SNAP_THRESHOLD) {
                snapMode('half');
            } else {
                snapMode('peek');
            }
        }, [getCollapsedTop, isDraggingSheet, sheetTopPx, snapMode]);

        useEffect(() => {
            if (isDesktopLayout) return;
            const el = listScrollRef.current;
            if (!el) return;

            const onTouchStart = (event: TouchEvent) => {
                const touch = event.touches[0];
                contentTouchYRef.current = touch ? touch.clientY : null;
            };

            const onTouchMove = (event: TouchEvent) => {
                if (isDraggingSheet) return;
                const touch = event.touches[0];
                if (!touch) return;

                const prevY = contentTouchYRef.current;
                contentTouchYRef.current = touch.clientY;
                if (prevY == null) return;

                const dy = touch.clientY - prevY;
                const currentTop = sheetTopRef.current ?? getCollapsedTop();
                const peekTop = getTopForMode('peek');

                // Drag up — climb from peek/half toward full while clamped to header stop.
                if (dy < 0 && currentTop > HEADER_STOP_TOP_PX) {
                    const consume = Math.min(-dy, currentTop - HEADER_STOP_TOP_PX);
                    const nextTop = currentTop - consume;
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop <= HEADER_STOP_TOP_PX + 0.5) setSheetMode('full');
                    event.preventDefault();
                    return;
                }

                // Drag down at the top of the list — collapse from full/half down to peek.
                if (dy > 0 && el.scrollTop <= 0 && currentTop < peekTop) {
                    const nextTop = Math.min(peekTop, currentTop + dy);
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop >= peekTop - 0.5) {
                        setSheetMode('peek');
                        setSheetTopPx(peekTop);
                        sheetTopRef.current = peekTop;
                    }
                    event.preventDefault();
                }
            };

            el.addEventListener('touchstart', onTouchStart, { passive: true });
            el.addEventListener('touchmove', onTouchMove, { passive: false });
            return () => {
                el.removeEventListener('touchstart', onTouchStart);
                el.removeEventListener('touchmove', onTouchMove);
            };
        }, [getCollapsedTop, getTopForMode, isDesktopLayout, isDraggingSheet]);

        const collapsedTop = getCollapsedTop();
        const baseTop = sheetTopPx ?? collapsedTop;
        const radiusReductionStartTop = HEADER_STOP_TOP_PX + SHEET_RADIUS_REDUCTION_DISTANCE_PX;
        const radiusProgress = Math.min(
            1,
            Math.max(0, (baseTop - HEADER_STOP_TOP_PX) / SHEET_RADIUS_REDUCTION_DISTANCE_PX)
        );
        const dynamicTopRadius =
            baseTop >= radiusReductionStartTop ? SHEET_MAX_RADIUS_PX : SHEET_MAX_RADIUS_PX * radiusProgress;
        const isSheetFullyStretched = baseTop <= HEADER_STOP_TOP_PX + 0.5;
        const isSheetContentScrollable = isDesktopLayout || isSheetFullyStretched;

        useEffect(() => {
            const el = listScrollRef.current;
            if (!el) return;
            if (!isSheetContentScrollable && el.scrollTop !== 0) {
                el.scrollTop = 0;
            }
        }, [isSheetContentScrollable]);

        useEffect(() => {
            if (isDesktopLayout) return;
            const el = listScrollRef.current;
            if (!el) return;

            const onWheel = (event: WheelEvent) => {
                if (isDraggingSheet) return;
                const scrollEl = listScrollRef.current;
                if (!scrollEl) return;

                const currentTop = sheetTopRef.current ?? getCollapsedTop();
                const peekTop = getTopForMode('peek');
                const deltaY = event.deltaY;

                if (deltaY > 0 && currentTop > HEADER_STOP_TOP_PX) {
                    const consume = Math.min(deltaY, currentTop - HEADER_STOP_TOP_PX);
                    const nextTop = currentTop - consume;
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop <= HEADER_STOP_TOP_PX + 0.5) setSheetMode('full');
                    event.preventDefault();
                    return;
                }

                if (deltaY < 0 && scrollEl.scrollTop <= 0 && currentTop < peekTop) {
                    const consume = Math.min(-deltaY, peekTop - currentTop);
                    const nextTop = currentTop + consume;
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop >= peekTop - 0.5) {
                        setSheetMode('peek');
                        setSheetTopPx(peekTop);
                        sheetTopRef.current = peekTop;
                    }
                    event.preventDefault();
                }
            };

            el.addEventListener('wheel', onWheel, { passive: false });
            return () => el.removeEventListener('wheel', onWheel);
        }, [getCollapsedTop, getTopForMode, isDesktopLayout, isDraggingSheet]);

        useEffect(() => {
            if (typeof window === 'undefined' || !isDraggingSheet || isDesktopLayout) return;
            const onMouseMove = (event: MouseEvent) => handleSheetDragMove(event.clientY);
            const onMouseUp = () => handleSheetDragEnd();
            const onTouchMove = (event: TouchEvent) => {
                const touch = event.touches[0];
                if (!touch) return;
                handleSheetDragMove(touch.clientY);
            };
            const onTouchEnd = () => handleSheetDragEnd();

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('touchmove', onTouchMove, { passive: true });
            window.addEventListener('touchend', onTouchEnd);
            return () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                window.removeEventListener('touchmove', onTouchMove);
                window.removeEventListener('touchend', onTouchEnd);
            };
        }, [handleSheetDragEnd, handleSheetDragMove, isDesktopLayout, isDraggingSheet]);

        return (
            <div className="h-dvh overflow-hidden overscroll-none flex flex-col bg-background">
                {/* Fixed header — same spec as FlowStepHeader (h-16, z-[200], bg-background) */}
                <div className="fixed inset-x-0 top-0 z-[200] flex h-16 items-center gap-3 bg-background px-4 shadow-sm">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        type="button"
                        onClick={onClose}
                        aria-label="Back"
                    >
                        <ArrowLeft size={18} weight="bold" className="text-foreground" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        {headerRight}
                    </div>
                </div>

                {/* Body — map fills the background; sheet overlays it */}
                <div className="relative min-h-0 flex-1 pt-16 lg:flex lg:flex-row lg:gap-3 lg:p-4 lg:pt-20">
                    {/* Map panel */}
                    <div
                        className={
                            isDesktopLayout
                                ? 'relative z-20 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background p-3 lg:h-[min(920px,calc(100dvh-9rem))] lg:w-1/2'
                                : 'fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden bg-background px-3 pt-2'
                        }
                        style={
                            isDesktopLayout
                                ? undefined
                                : {
                                      top: `${HEADER_STOP_TOP_PX}px`,
                                      bottom: `calc(100dvh - ${baseTop}px + 16px)`,
                                  }
                        }
                    >
                        <div
                            className={
                                isDesktopLayout
                                    ? 'relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-sm'
                                    : 'relative min-h-0 flex-1 overflow-hidden rounded-t-xl border border-border bg-background shadow-sm'
                            }
                        >
                            {mapSlot}
                            {mapLoadingOverlay}
                        </div>
                    </div>

                    {/* Sheet panel */}
                    <div
                        className={
                            isDesktopLayout
                                ? 'relative z-30 flex min-h-0 w-full flex-1 touch-pan-y flex-col gap-4 overflow-y-auto border-border bg-background px-4 pb-4 pt-4 shadow-lg lg:h-[min(920px,calc(100dvh-9rem))] lg:w-1/2 lg:border-l lg:border-t-0 lg:px-5 lg:py-5 lg:shadow-none'
                                : 'fixed inset-x-0 z-30 mx-auto flex w-full max-w-3xl touch-pan-y flex-col gap-4 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lg'
                        }
                        ref={setListRef}
                        style={
                            isDesktopLayout
                                ? undefined
                                : {
                                      top: `${baseTop}px`,
                                      height: `calc(100dvh - ${baseTop}px)`,
                                      minHeight: `${SHEET_PEEK_HEIGHT_PX}px`,
                                      borderTopLeftRadius: dynamicTopRadius,
                                      borderTopRightRadius: dynamicTopRadius,
                                      willChange: 'top, border-top-left-radius, border-top-right-radius',
                                      overflowY: isSheetContentScrollable ? 'auto' : 'hidden',
                                  }
                        }
                    >
                        {!isDesktopLayout ? (
                            <div className="relative mx-auto flex h-6 w-full items-center justify-center">
                                <button
                                    type="button"
                                    onClick={cycleSheet}
                                    onMouseDown={(event) => handleSheetDragStart(event.clientY)}
                                    onTouchStart={(event) => {
                                        const touch = event.touches[0];
                                        if (!touch) return;
                                        handleSheetDragStart(touch.clientY);
                                    }}
                                    className="flex h-6 w-24 items-center justify-center"
                                    aria-label={
                                        sheetMode === 'full'
                                            ? 'Collapse provider list'
                                            : 'Expand provider list'
                                    }
                                >
                                    <span className="h-1.5 w-10 rounded-full bg-muted" />
                                </button>
                                {sheetMode === 'peek' && typeof peekProviderCount === 'number' && peekProviderCount > 0 ? (
                                    <span
                                        className="absolute right-2 top-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium leading-none text-background"
                                        aria-label={`${peekProviderCount} providers found`}
                                    >
                                        {peekProviderCount} match{peekProviderCount === 1 ? '' : 'es'}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                        {children}
                    </div>
                </div>
            </div>
        );
    }
);
