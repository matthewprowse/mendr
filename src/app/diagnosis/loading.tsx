import { Skeleton } from '@/components/ui/skeleton';

/*
 * Route-level Suspense fallback for /diagnosis and /diagnosis/[id].
 *
 * Mirrors the diagnosis page's own `showSkeleton` shell so the handoff is
 * seamless: a sticky FlowTopBar-style header above a centred max-w-xl column
 * with a title + badge, the four uploaded-photo tiles (2×2), the "thinking"
 * analysis lines, and the diagnosis output lines.
 *
 * ⚠️ Keep this in sync with the `showSkeleton` blocks in
 * diagnosis/client.tsx (title/badge · grid-cols-2 image tiles · thought
 * lines · detail lines + CTA).
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
                <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                    {/* Title + badge */}
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-8 w-[88%] max-w-md" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                    </div>

                    {/* Four uploaded photos + thinking */}
                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2">
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                            <Skeleton className="aspect-square w-full rounded-lg" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <Skeleton className="h-3.5 w-full" />
                            <Skeleton className="h-3.5 w-[94%]" />
                            <Skeleton className="h-3.5 w-[88%]" />
                            <Skeleton className="h-3.5 w-[72%]" />
                        </div>
                    </div>

                    {/* Output / details */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2.5">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[96%]" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[80%]" />
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-[90%]" />
                            <Skeleton className="h-9 w-full rounded-xl" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
