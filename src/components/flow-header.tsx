'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/** Total steps in the homeowner scan flow (Upload → Diagnose → Match), shown on `/start`. */
export const SCAN_FLOW_STEPS = 3;

const INK = '#16120E';
const ACCENT = '#E8601A';

/**
 * Fixed header bar shared across legal, auth, and pro flows.
 * Use `layout="inline"` + `showScanProgress` on diagnosis/match-adjacent screens to mirror `/start`.
 */
export function FlowStepHeader({
    step,
    onBack,
    backHref,
    centerLabel = 'Menda',
    rightSlot,
    /** Renders the same 3-dot progress row as `/start` (highlights `step`). */
    showScanProgress = false,
    /** `fixed` = legacy overlay header. `inline` = in-flow bar matching `/start` (parent supplies page bg). */
    layout = 'fixed',
}: {
    step: number;
    onBack: (() => void) | null;
    backHref?: string;
    centerLabel?: string;
    /** Overrides the progress dots when set (e.g. share action on the report page). */
    rightSlot?: React.ReactNode;
    showScanProgress?: boolean;
    layout?: 'fixed' | 'inline';
}) {
    const backEl = backHref ? (
        <Link
            href={backHref}
            aria-label="Go back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.06] transition-colors active:bg-black/10"
        >
            <ArrowLeft size={18} weight="bold" style={{ color: INK }} aria-hidden />
        </Link>
    ) : onBack ? (
        <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.06] transition-colors active:bg-black/10"
        >
            <ArrowLeft size={18} weight="bold" style={{ color: INK }} aria-hidden />
        </button>
    ) : (
        <span className="h-11 w-11 shrink-0" aria-hidden />
    );

    const scanDots = (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5">
            {Array.from({ length: SCAN_FLOW_STEPS }, (_, i) => {
                const n = i + 1;
                const active = n === step;
                return (
                    <span
                        key={n}
                        className={cn(
                            'h-1.5 rounded-full transition-all duration-300',
                            active ? 'w-5' : 'w-1.5 bg-foreground/20',
                        )}
                        style={active ? { background: ACCENT } : undefined}
                    />
                );
            })}
        </div>
    );

    const right =
        showScanProgress && !rightSlot ? scanDots : (rightSlot ?? <span className="h-11 w-11 shrink-0" aria-hidden />);

    const row = (
        <>
            {backEl}
            <span
                className="min-w-0 flex-1 truncate px-2 text-center text-lg font-bold"
                style={{ color: INK }}
            >
                {centerLabel}
            </span>
            {right}
        </>
    );

    if (layout === 'inline') {
        return (
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">{row}</div>
        );
    }

    return (
        <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-between bg-background px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))]">
            {row}
        </div>
    );
}
