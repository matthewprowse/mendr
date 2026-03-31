'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

/** Total steps in the homeowner scan flow: Upload → Diagnose → Match. */
export const SCAN_FLOW_STEPS = 3;

/**
 * Fixed header bar shared across all three scan-flow pages.
 * Mirrors the StepHeader in /pro/onboard exactly.
 */
export function FlowStepHeader({
    step,
    onBack,
    backHref,
    centerLabel = 'Scandio',
}: {
    step: number;
    onBack: (() => void) | null;
    backHref?: string;
    centerLabel?: string;
}) {
    return (
        <div className="fixed inset-x-0 top-0 z-[200] flex h-16 items-center justify-between bg-background px-4">
            <div className="h-10 w-10">
                {backHref ? (
                    <Button asChild variant="secondary" className="size-10 touch-manipulation" aria-label="Go Back">
                        <Link href={backHref}>
                            <ArrowLeft className="size-5 text-foreground" />
                        </Link>
                    </Button>
                ) : onBack ? (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onBack}
                        className="size-10 touch-manipulation"
                        aria-label="Go Back"
                    >
                        <ArrowLeft className="size-5 text-foreground" />
                    </Button>
                ) : (
                    // Empty placeholder keeps the title centred
                    <span />
                )}
            </div>

            <span className="text-lg font-semibold text-foreground">{centerLabel}</span>

            {/* Balance the back button column; not an interactive control */}
            <div className="size-10 shrink-0" aria-hidden="true" />
        </div>
    );
}
