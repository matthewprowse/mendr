import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton that matches ProviderCard structure exactly for seamless loading transition. */
function ProviderCardSkeleton() {
    return (
        <Card className="flex flex-col h-full border-input shadow-none p-4 rounded-md">
            <CardHeader className="flex flex-col gap-3 p-0">
                <div className="flex flex-col gap-2 w-full min-w-0">
                    <div className="flex justify-between items-center gap-2 w-full min-w-0">
                        <div className="min-w-0 flex-1">
                            <CardTitle className="p-0 text-lg font-semibold">
                                <Skeleton className="h-6 w-[70%] max-w-[180px]" />
                            </CardTitle>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-4 w-8" />
                            <Skeleton className="h-3 w-6" />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-6 w-14 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                </div>
            </CardHeader>
            <div className="flex items-center gap-1 w-full min-w-0">
                <Skeleton className="h-3.5 w-[85%] max-w-[220px]" />
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-7 w-16 rounded-md" />
                </div>
                <div className="border-l-2 border-input pl-3">
                    <Skeleton className="h-3.5 w-full mb-1.5" />
                    <Skeleton className="h-3.5 w-[90%] mb-1.5" />
                    <Skeleton className="h-3.5 w-[70%]" />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-auto">
                <Skeleton className="h-9 flex-1 min-w-0 rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md shrink-0" />
                <Skeleton className="h-9 w-9 rounded-md shrink-0" />
            </div>
        </Card>
    );
}

/** Scandio's Pick skeleton: matches populated layout exactly for seamless switch. */
function ScandiosPickSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <Separator className="w-full" />
            <div className="flex flex-col gap-1.5">
                <h2 className="text-lg font-semibold text-foreground">Scandio&apos;s Pick</h2>
                {/* favouriteReason line */}
                <Skeleton className="h-3.5 w-[75%]" />
                <Skeleton className="h-3.5 w-[55%]" />
            </div>
            <ProviderCardSkeleton />
        </div>
    );
}

/** Other Recommended Providers skeleton: matches populated layout exactly for seamless switch. */
function OtherProvidersSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold text-foreground">
                    Other Recommended Providers
                </h3>
                {/* Subheading description lines */}
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[65%]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ProviderCardSkeleton />
                <ProviderCardSkeleton />
            </div>
        </div>
    );
}

export function ProvidersSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <ScandiosPickSkeleton />
            <OtherProvidersSkeleton />
        </div>
    );
}

/**
 * Full-page skeleton for the image-upload diagnosis flow.
 * Mirrors: uploaded image → thinking block → diagnosis card → provider cards.
 */
export function ChatPageImageSkeleton() {
    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Uploaded image placeholder — matches aspect-[16/10] on mobile */}
            <div className="max-w-[420px] w-full aspect-[16/10] md:aspect-[4/3] rounded-lg overflow-hidden border border-border/50">
                <Skeleton className="h-full w-full rounded-none" />
            </div>

            {/* Thinking / analysing block */}
            <div className="border-l-2 border-input pl-3 flex flex-col gap-2">
                <Skeleton className="h-3.5 w-[60%]" />
                <Skeleton className="h-3.5 w-[45%]" />
            </div>

            {/* Diagnosis title + action */}
            <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-6 w-[70%]" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[85%]" />
                <Skeleton className="h-3.5 w-[55%]" />
            </div>

            {/* Estimated cost */}
            <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-[65%]" />
            </div>

            <ProvidersSkeleton />
        </div>
    );
}

/**
 * Full-page skeleton for the direct trade-select flow.
 * Mirrors: diagnosis title → action → map → provider cards.
 */
export function ChatPageTradeSkeleton() {
    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Service badge + title */}
            <div className="flex flex-col gap-3 mt-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-6 w-[55%]" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[80%]" />
            </div>

            <ProvidersSkeleton />
        </div>
    );
}
