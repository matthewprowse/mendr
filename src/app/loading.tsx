import { Skeleton } from '@/components/ui/skeleton';

/*
 * Root-level Suspense fallback (catch-all for any route segment without its
 * own loading.tsx). Because it covers many different pages, this is a NEUTRAL
 * app shell rather than a page-specific skeleton: a sticky top-bar row
 * (matching the shared FlowTopBar three-slot layout) over a centred max-w-xl
 * column with a heading block and a few content rows. Most authenticated
 * pages now render server-side (SSR), so this fallback fires mainly during
 * client navigations that suspend.
 *
 * ⚠️ This is intentionally generic — do NOT tailor it to one page. If a
 * specific route needs an accurate skeleton, add a `loading.tsx` in that
 * route's own folder (see app/match/loading.tsx and app/diagnosis/loading.tsx)
 * rather than specialising this catch-all.
 */
export default function Loading() {
    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {/* Top bar shell — three-slot FlowTopBar layout */}
            <div className="sticky top-0 z-20 shrink-0 bg-background p-4">
                <div className="flex w-full items-center gap-3">
                    <Skeleton className="size-10 shrink-0 rounded-md" />
                    <div className="flex-1" />
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                    {/* Heading block */}
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-7 w-1/2 rounded" />
                        <Skeleton className="h-4 w-3/4 rounded" />
                    </div>

                    {/* Content rows */}
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-4 w-[92%] rounded" />
                        <Skeleton className="h-4 w-[85%] rounded" />
                        <Skeleton className="h-4 w-2/3 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}
