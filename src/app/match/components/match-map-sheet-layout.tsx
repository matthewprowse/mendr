'use client';

import {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { ScanFlowShell } from '@/components/scan-flow-shell';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@phosphor-icons/react';

const HEADER_STOP_TOP_PX = 80;
const SHEET_MIN_HEIGHT_PX = 348;
const SHEET_MAX_RADIUS_PX = 16;
const SHEET_RADIUS_REDUCTION_DISTANCE_PX = 196;

export type MatchMapSheetLayoutProps = {
    onClose: () => void;
    headerRight: ReactNode;
    mapSlot: ReactNode;
    mapLoadingOverlay?: ReactNode;
    children: ReactNode;
    /** Scroll selected provider card into view when this key changes (e.g. placeId). */
    scrollToKey?: string | null;
    getScrollTarget?: () => HTMLElement | null;
    /** Increment (e.g. on map pin tap) to expand the sheet and show the list. */
    expandRequestId?: number;
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
        },
        ref
    ) {
        const [sheetMode, setSheetMode] = useState<'half' | 'full'>('half');
        const [sheetTopPx, setSheetTopPx] = useState<number | null>(null);
        const [isDraggingSheet, setIsDraggingSheet] = useState(false);

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

        const getCollapsedTop = useCallback(() => {
            if (typeof window === 'undefined') return HEADER_STOP_TOP_PX;
            return Math.max(HEADER_STOP_TOP_PX, window.innerHeight - SHEET_MIN_HEIGHT_PX);
        }, []);

        const setSheetTopFromScroll = useCallback(() => {
            if (typeof window === 'undefined') return;
            if (sheetMode === 'full') {
                setSheetTopPx(HEADER_STOP_TOP_PX);
                return;
            }
            setSheetTopPx(getCollapsedTop());
        }, [getCollapsedTop, sheetMode]);

        useEffect(() => {
            sheetTopRef.current = sheetTopPx;
        }, [sheetTopPx]);

        useEffect(() => {
            if (typeof window === 'undefined') return;
            setSheetTopFromScroll();
            const onResize = () => {
                if (sheetMode === 'full') {
                    setSheetTopPx(HEADER_STOP_TOP_PX);
                } else {
                    setSheetTopPx(getCollapsedTop());
                }
            };
            window.addEventListener('resize', onResize);
            return () => window.removeEventListener('resize', onResize);
        }, [getCollapsedTop, setSheetTopFromScroll, sheetMode]);

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
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
        }, [scrollToKey, getScrollTarget]);

        const expandSheet = useCallback(() => {
            setSheetMode('full');
            setSheetTopPx(HEADER_STOP_TOP_PX);
            sheetTopRef.current = HEADER_STOP_TOP_PX;
        }, []);

        useEffect(() => {
            if (!expandRequestId) return;
            expandSheet();
        }, [expandRequestId, expandSheet]);

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
            const currentTop = sheetTopPx ?? getCollapsedTop();
            const midpoint = (HEADER_STOP_TOP_PX + getCollapsedTop()) / 2;
            if (currentTop <= midpoint) {
                setSheetMode('full');
                setSheetTopPx(HEADER_STOP_TOP_PX);
                sheetTopRef.current = HEADER_STOP_TOP_PX;
            } else {
                setSheetMode('half');
                setSheetTopPx(getCollapsedTop());
                sheetTopRef.current = getCollapsedTop();
            }
        }, [getCollapsedTop, isDraggingSheet, sheetTopPx]);

        useEffect(() => {
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
                const collapsedTop = getCollapsedTop();

                if (dy < 0 && currentTop > HEADER_STOP_TOP_PX) {
                    const consume = Math.min(-dy, currentTop - HEADER_STOP_TOP_PX);
                    const nextTop = currentTop - consume;
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop <= HEADER_STOP_TOP_PX + 0.5) setSheetMode('full');
                    event.preventDefault();
                    return;
                }

                if (dy > 0 && el.scrollTop <= 0 && currentTop < collapsedTop) {
                    const nextTop = Math.min(collapsedTop, currentTop + dy);
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop >= collapsedTop - 0.5) {
                        setSheetMode('half');
                        setSheetTopPx(collapsedTop);
                        sheetTopRef.current = collapsedTop;
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
        }, [getCollapsedTop, isDraggingSheet]);

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
        const isSheetContentScrollable = isSheetFullyStretched;

        useEffect(() => {
            const el = listScrollRef.current;
            if (!el) return;
            if (!isSheetContentScrollable && el.scrollTop !== 0) {
                el.scrollTop = 0;
            }
        }, [isSheetContentScrollable]);

        useEffect(() => {
            const el = listScrollRef.current;
            if (!el) return;

            const onWheel = (event: WheelEvent) => {
                if (isDraggingSheet) return;
                const scrollEl = listScrollRef.current;
                if (!scrollEl) return;

                const currentTop = sheetTopRef.current ?? getCollapsedTop();
                const collapsedTopLocal = getCollapsedTop();
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

                if (deltaY < 0 && scrollEl.scrollTop <= 0 && currentTop < collapsedTopLocal) {
                    const consume = Math.min(-deltaY, collapsedTopLocal - currentTop);
                    const nextTop = currentTop + consume;
                    sheetTopRef.current = nextTop;
                    setSheetTopPx(nextTop);
                    if (nextTop >= collapsedTopLocal - 0.5) {
                        setSheetMode('half');
                        setSheetTopPx(collapsedTopLocal);
                        sheetTopRef.current = collapsedTopLocal;
                    }
                    event.preventDefault();
                }
            };

            el.addEventListener('wheel', onWheel, { passive: false });
            return () => el.removeEventListener('wheel', onWheel);
        }, [getCollapsedTop, isDraggingSheet]);

        useEffect(() => {
            if (typeof window === 'undefined' || !isDraggingSheet) return;
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
        }, [handleSheetDragEnd, handleSheetDragMove, isDraggingSheet]);

        return (
            <ScanFlowShell
                onClose={onClose}
                constrainContentWidth
                logoClassName="hidden"
                headerClassName="bg-background shadow-md"
                contentWrapperClassName="p-0 pt-20 gap-0 min-h-screen"
                contentClassName="relative mx-auto w-full max-w-3xl gap-0 p-0 pb-[52dvh]"
                headerLeft={
                    <Button variant="outline" className="size-10" type="button" onClick={onClose}>
                        <ArrowLeft size={24} weight="bold" className="text-foreground" />
                    </Button>
                }
                headerRight={headerRight}
            >
                <div
                    className="fixed inset-x-0 z-20 overflow-hidden bg-muted"
                    style={{ top: `${HEADER_STOP_TOP_PX}px`, bottom: 0 }}
                >
                    {mapSlot}
                    {mapLoadingOverlay}
                </div>

                <div
                    className="fixed inset-x-0 z-30 mx-auto flex w-full max-w-3xl touch-pan-y flex-col gap-4 overflow-y-auto border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lg"
                    ref={setListRef}
                    style={{
                        top: `${baseTop}px`,
                        height: `calc(100dvh - ${baseTop}px)`,
                        minHeight: `${SHEET_MIN_HEIGHT_PX}px`,
                        borderTopLeftRadius: dynamicTopRadius,
                        borderTopRightRadius: dynamicTopRadius,
                        willChange: 'top, border-top-left-radius, border-top-right-radius',
                        overflowY: isSheetContentScrollable ? 'auto' : 'hidden',
                    }}
                >
                    <button
                        type="button"
                        onClick={expandSheet}
                        onMouseDown={(event) => handleSheetDragStart(event.clientY)}
                        onTouchStart={(event) => {
                            const touch = event.touches[0];
                            if (!touch) return;
                            handleSheetDragStart(touch.clientY);
                        }}
                        className="mx-auto flex h-5 w-20 items-center justify-center"
                        aria-label="Expand provider list"
                    >
                        <span className="h-1.5 w-10 rounded-full bg-muted" />
                    </button>
                    {children}
                </div>
            </ScanFlowShell>
        );
    }
);
