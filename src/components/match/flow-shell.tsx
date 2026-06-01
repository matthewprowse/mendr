'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Sticky top bar primitive shared across /start, /diagnosis, and /match.
 *
 * Default left slot is a 40px back button; pass a custom `leftSlot` to override
 * (e.g. a logo). Use `rightSlot` for in-flow actions (filters, finish, etc.).
 *
 * Heights and paddings deliberately match `app/src/app/start/client.tsx` so any
 * page composing FlowTopBar lines up pixel-perfect with the existing flow.
 */
export function FlowTopBar({
    onBack,
    leftSlot,
    centerSlot,
    rightSlot,
    className,
}: {
    onBack?: () => void;
    leftSlot?: ReactNode;
    centerSlot?: ReactNode;
    rightSlot?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'sticky top-0 z-20 shrink-0 bg-background px-6 py-3',
                className
            )}
        >
            <div className="flex w-full items-center gap-3">
                <div className="shrink-0">
                    {leftSlot ?? (
                        onBack ? (
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="size-10"
                                onClick={onBack}
                                aria-label="Go back"
                            >
                                <ArrowLeft strokeWidth={2.5} />
                            </Button>
                        ) : null
                    )}
                </div>
                {centerSlot ? (
                    <div className="min-w-0 flex-1">{centerSlot}</div>
                ) : (
                    <div className="flex-1" />
                )}
                {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>
        </div>
    );
}

/**
 * Sticky bottom action bar — used for "Continue", "Show N results", etc.
 *
 * Inner column is constrained to `max-w-sm` to keep CTAs comfortable on tablet
 * and desktop while the surrounding layout remains full-bleed.
 */
export function FlowFooter({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'sticky bottom-0 shrink-0 bg-background px-6 py-3',
                className
            )}
        >
            <div className="w-full max-w-sm mx-auto">{children}</div>
        </div>
    );
}

/**
 * Centred title + subtitle used at the top of every step card.
 */
export function StepHeading({
    title,
    sub,
    align = 'center',
}: {
    title: string;
    sub?: string;
    align?: 'center' | 'left';
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 w-full',
                align === 'center' ? 'text-center items-center' : 'text-left'
            )}
        >
            <h1 className="text-2xl font-semibold text-foreground">
                {title}
            </h1>
            {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
        </div>
    );
}
