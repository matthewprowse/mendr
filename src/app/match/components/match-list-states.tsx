'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Bottom-sheet placeholder cards shown while the provider list is loading. */
export function MatchListSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={`sk-${i}`}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                            <Skeleton className="h-6 w-3/5" />
                            <Skeleton className="size-8 rounded-md" />
                        </div>
                        <Skeleton className="h-4 w-2/5" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-[92%]" />
                        <Skeleton className="h-3.5 w-[70%]" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-10 flex-1" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Shown when filters hide every provider in the current result set. */
export function MatchFilteredEmpty({ onClearFilters }: { onClearFilters: () => void }) {
    return (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background p-4 text-center">
            <p className="text-sm font-medium">No matches with these filters</p>
            <p className="text-xs text-muted-foreground">
                Try clearing some filters or expanding the distance range.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={onClearFilters}>
                Clear filters
            </Button>
        </div>
    );
}
