'use client';

/**
 * PhotoViewer — bottom Sheet on mobile, centered Dialog on desktop.
 *
 * Replaces the earlier absolute-positioned full-screen overlay so the photo
 * viewer uses the same shell primitives (Sheet + Dialog) as the
 * ClarificationDrawer. Consistent z-index management, consistent open/close
 * animation, consistent escape-key behaviour.
 *
 * Layout:
 *   - Header row (only when multiple photos): "Photo N" text-sm font-medium
 *     on the left, two `variant="ghost"` arrow buttons on the right —
 *     `size="icon-sm"` (32×32) inside the mobile drawer for tighter use of
 *     space, `size="icon"` (40×40) inside the desktop dialog to match the
 *     app's stock icon-button rhythm.
 *   - Image card: `aspect-square rounded-xl overflow-hidden`. No background,
 *     no padding — image fills the square edge-to-edge via `object-cover`
 *     (same crop-to-fit behaviour as the diagnosis-page grid tiles). Mobile
 *     swipe via touch handlers on the card.
 *   - Caption beneath the image: text-sm muted, centered.
 */

import { useCallback, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

const SWIPE_THRESHOLD_PX = 40;

export function PhotoViewer({
    open,
    onOpenChange,
    images,
    descriptions,
    index,
    onIndexChange,
}: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    images: string[];
    /** Per-image description text. Length doesn't have to match images. */
    descriptions: string[];
    /** Currently-displayed image index (0-based). null = no image active. */
    index: number | null;
    /** Called when the user navigates to a different image. */
    onIndexChange: (next: number) => void;
}) {
    const isMobile = useIsMobile();
    const touchStartXRef = useRef<number | null>(null);

    const total = images.length;
    const hasMultiple = total > 1;
    const safeIdx = index ?? 0;
    const src = images[safeIdx] ?? '';
    const caption = (descriptions[safeIdx] ?? '').trim();
    // Nav arrows are tighter inside the mobile drawer (icon-sm = 32×32) and
    // full default size in the desktop dialog (icon = 40×40, matches the
    // app's stock icon-button rhythm).
    const navButtonSize: 'icon-sm' | 'icon' = isMobile ? 'icon-sm' : 'icon';

    const goPrev = useCallback(() => {
        if (!hasMultiple) return;
        onIndexChange(safeIdx <= 0 ? total - 1 : safeIdx - 1);
    }, [hasMultiple, onIndexChange, safeIdx, total]);

    const goNext = useCallback(() => {
        if (!hasMultiple) return;
        onIndexChange(safeIdx >= total - 1 ? 0 : safeIdx + 1);
    }, [hasMultiple, onIndexChange, safeIdx, total]);

    // Shared body. Rendered identically inside Sheet (mobile) and Dialog
    // (desktop) so we only design the layout once.
    //
    // Layout:
    //   - Header row (only when multiple photos): "Photo N" label on the
    //     left, two h-8 ghost icon buttons (prev / next) on the right.
    //     Nothing overlays the image.
    //   - Image card: bg-secondary, rounded-xl, p-3, fixed h-[370px] so the
    //     drawer's height is predictable. Image uses object-contain.
    //   - Caption beneath, text-sm muted, centered.
    const body = src ? (
        <div className="flex w-full flex-col gap-4 p-4">
            {hasMultiple ? (
                <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                        Photo {safeIdx + 1}
                    </p>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size={navButtonSize}
                            aria-label="Previous photo"
                            onClick={goPrev}
                        >
                            <ArrowLeft strokeWidth={2.5} aria-hidden />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size={navButtonSize}
                            aria-label="Next photo"
                            onClick={goNext}
                        >
                            <ArrowRight strokeWidth={2.5} aria-hidden />
                        </Button>
                    </div>
                </div>
            ) : null}

            <div
                className="aspect-square w-full overflow-hidden rounded-xl"
                onTouchStart={(e) => {
                    touchStartXRef.current =
                        e.changedTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(e) => {
                    const startX = touchStartXRef.current;
                    const endX = e.changedTouches[0]?.clientX ?? null;
                    touchStartXRef.current = null;
                    if (startX == null || endX == null) return;
                    const dx = endX - startX;
                    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
                    if (dx > 0) goPrev();
                    else goNext();
                }}
            >
                {/* Image fills the entire square edge-to-edge.
                    `object-cover` crops mismatched aspect ratios — same as
                    the diagnosis-page grid tiles. The container's
                    `rounded-xl + overflow-hidden` clips the image corners. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={`Uploaded issue photo ${safeIdx + 1}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            </div>

            <p className="w-full text-center text-sm text-muted-foreground">
                {caption || 'No description for this photo yet.'}
            </p>
        </div>
    ) : null;

    const titleText = `Photo ${safeIdx + 1}`;
    const descriptionText = caption || 'Photo from your diagnosis.';

    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="max-h-[90vh] overflow-y-auto rounded-t-xl p-0"
                >
                    <SheetTitle className="sr-only">{titleText}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {descriptionText}
                    </SheetDescription>
                    <div className="mx-auto w-full max-w-xl">{body}</div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="max-w-md gap-0 overflow-y-auto p-0"
            >
                <DialogTitle className="sr-only">{titleText}</DialogTitle>
                <DialogDescription className="sr-only">
                    {descriptionText}
                </DialogDescription>
                {body}
            </DialogContent>
        </Dialog>
    );
}
