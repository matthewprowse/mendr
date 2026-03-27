'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

/** Total steps in the homeowner scan flow: Upload → Diagnose → Match. */
export const SCAN_FLOW_STEPS = 3;

/**
 * Fixed header bar shared across all three scan-flow pages.
 * Mirrors the StepHeader in /pro/onboard exactly.
 */
export function FlowStepHeader({
    step,
    onBack,
}: {
    step: number;
    onBack: (() => void) | null;
}) {
    return (
        <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between bg-background px-4">
            <div className="h-10 w-10">
                {onBack ? (
                    <Button
                        variant="secondary"
                        onClick={onBack}
                        className="size-10"
                        aria-label="Go Back"
                    >
                        <ArrowLeft className="size-5 text-foreground" />
                    </Button>
                ) : (
                    // Empty placeholder keeps the title centred
                    <span />
                )}
            </div>

            <span className="text-lg font-semibold text-foreground">Scandio</span>

            <Button className="size-10" variant="ghost" disabled />
        </div>
    );
}
