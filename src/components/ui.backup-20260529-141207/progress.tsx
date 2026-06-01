'use client';

import { cn } from '@/lib/utils';

export function Progress({
    value = 0,
    className,
}: {
    value?: number;
    className?: string;
}) {
    const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    return (
        <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}>
            <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${safe}%` }}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={safe}
                role="progressbar"
            />
        </div>
    );
}
