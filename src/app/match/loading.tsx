import { Skeleton } from '@/components/ui/skeleton';

/*
 * Route-level Suspense fallback for /match and /match/[id].
 *
 * Bridges the brief gap before the match client mounts (and shows its own
 * `showBottomSkeleton`). To make that handoff seamless, the card skeletons
 * here intentionally match the in-page skeleton shape in
 * `match/components/client.tsx`: a search-bar row above a stack of
 * rounded-3xl provider cards (name h-6 w-56 · subtitle h-4 w-44 · two body
 * lines · two CTA buttons h-10).
 *
 * ⚠️ Keep these cards in sync with the `showBottomSkeleton` block in
 * match/components/client.tsx. If that card skeleton's shape changes
 * (radius, padding, line widths, CTA layout), mirror the change here so the
 * route fallback and the mounted client skeleton stay visually identical.
 */
export default function MatchLoading() {
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            {/* Search / filter bar row */}
            <div className="sticky top-0 z-20 shrink-0 bg-background p-4">
                <div className="mx-auto flex w-full max-w-xl items-center gap-2">
                    <Skeleton className="h-10 flex-1 rounded-md" />
                    <Skeleton className="size-10 shrink-0 rounded-md" />
                </div>
            </div>

            {/* Provider card list */}
            <div className="flex-1 p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="flex flex-col gap-4 rounded-3xl border border-black/[0.07] bg-white p-6 shadow-sm"
                        >
                            <div className="flex flex-col gap-2">
                                <Skeleton className="h-6 w-56" />
                                <Skeleton className="h-4 w-44" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[92%]" />
                            <div className="flex flex-row gap-2">
                                <Skeleton className="h-10 flex-1" />
                                <Skeleton className="h-10 flex-1" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
