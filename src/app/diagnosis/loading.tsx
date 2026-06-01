import { Skeleton } from '@/components/ui/skeleton';

/*
 * Route-level Suspense fallback for /diagnosis and /diagnosis/[id].
 *
 * Renders the diagnosis flow SHELL rather than a centred spinner: a sticky
 * FlowTopBar-style header (size-10 back button · flexible centre · size-10
 * avatar) above a centred max-w-xl column with an image frame, a heading,
 * and body lines — matching the shape the diagnosis page paints once it
 * mounts. The page's own FlowTopBar is not present yet while this fallback
 * shows, so the header is reproduced here as a skeleton.
 *
 * ⚠️ Keep this in rough sync with the diagnosis page shell. If the flow
 * header layout or the image frame height (h-56) changes, update this
 * fallback so the shell does not shift when the page mounts.
 */
export default function DiagnosisLoading() {
    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {/* FlowTopBar shell */}
            <div className="sticky top-0 z-20 shrink-0 bg-background p-4">
                <div className="flex w-full items-center gap-3">
                    <Skeleton className="size-10 shrink-0 rounded-md" />
                    <div className="flex-1" />
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
                    {/* Image frame */}
                    <Skeleton className="h-56 w-full rounded-lg" />

                    {/* Title + subtitle */}
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-7 w-2/3 rounded" />
                        <Skeleton className="h-4 w-1/2 rounded" />
                    </div>

                    {/* Body copy */}
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-4 w-[95%] rounded" />
                        <Skeleton className="h-4 w-[88%] rounded" />
                        <Skeleton className="h-4 w-2/3 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}
