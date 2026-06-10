'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { BRAND_NAME } from '@/lib/brand-system';
import { HeaderAuth } from '@/components/header-auth';

/** Height of the fixed branded header (back + Mendr wordmark + avatar) — matches the account-page FlowTopBar. */
const HEADER_PX = 64;

export type MatchResultsLayoutProps = {
    onClose: () => void;
    /** Address search field (full-width), shown at the top of the column. */
    addressSlot: ReactNode;
    /** Sort + Filter buttons row, shown beneath the address. */
    controlsSlot: ReactNode;
    /** The recommended-Pro grid (cards / empty / skeleton). */
    children: ReactNode;
};

/**
 * Match results layout — a single scrollable column, same width as the diagnosis
 * page (`max-w-xl`): branded header, then a flex column of address, Sort/Filter
 * controls, and the recommended-Pro grid. No map.
 */
export function MatchResultsLayout({
    onClose,
    addressSlot,
    controlsSlot,
    children,
}: MatchResultsLayoutProps) {
    return (
        <div
            className="flex h-dvh flex-col overflow-hidden bg-background"
            style={{ paddingTop: HEADER_PX }}
        >
            {/* Fixed branded header — matches the account-page FlowTopBar (back, Mendr wordmark, avatar). */}
            <div
                className="fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-background px-4"
                style={{ height: HEADER_PX }}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={onClose}
                >
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
                <HeaderAuth />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-8 p-4">
                    <div className="flex w-full flex-col gap-3">
                        <h1 className="text-2xl font-semibold text-foreground">Recommended Pros</h1>
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
                            tempor incididunt ut labore et dolore.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4">
                        {addressSlot}
                        {controlsSlot}
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
