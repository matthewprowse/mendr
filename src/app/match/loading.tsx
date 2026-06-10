import { Skeleton } from '@/components/ui/skeleton';

/*
 * Route-level Suspense fallback for /match and /match/[id].
 *
 * Bridges the brief gap before the match client mounts (and shows its own
 * `showBottomSkeleton`). To make that handoff seamless, this MUST mirror the
 * mounted page in `match/components/client.tsx` + `match-map-sheet-layout.tsx`:
 * a fixed branded header (64px), then a max-w-xl column of title, address,
 * Sort/Filter buttons, and the recommended-Pro card skeletons.
 *
 * ⚠️ Keep the card skeleton in sync with the `showBottomSkeleton` block in
 * match/components/client.tsx (name + heart · rating line · Mendr Summary
 * label + body lines · two CTA buttons).
 */
const HEADER_PX = 64;

export default function MatchLoading() {
    return (
        <div
            className="flex h-dvh flex-col overflow-hidden bg-background"
            style={{ paddingTop: HEADER_PX }}
        >
            {/* Fixed branded header (back · Mendr · avatar) */}
            <div
                className="fixed inset-x-0 top-0 z-[200] flex items-center justify-between gap-3 bg-background px-4"
                style={{ height: HEADER_PX }}
            >
                <Skeleton className="size-9 rounded-md" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="size-8 rounded-full" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
                    {/* Title + subtitle */}
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>

                    {/* Address */}
                    <Skeleton className="h-10 w-full rounded-md" />

                    {/* Sort + Filter */}
                    <div className="flex gap-2">
                        <Skeleton className="h-9 flex-1 rounded-md" />
                        <Skeleton className="h-9 flex-1 rounded-md" />
                    </div>

                    {/* Pro card skeletons */}
                    <div className="flex flex-col gap-4">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
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
                </div>
            </div>
        </div>
    );
}
