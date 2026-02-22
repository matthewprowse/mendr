import { Skeleton } from '@/components/ui/skeleton';

export function ProvidersSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border border-border p-4 flex flex-col gap-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            ))}
        </div>
    );
}
