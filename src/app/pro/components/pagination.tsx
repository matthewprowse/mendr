import { Button } from '@/components/ui/button';

export function ReviewsPaginationFooter({
    showingCount,
    total,
    categoryLabel,
    onViewMore,
    viewAllHref,
}: {
    showingCount: number;
    total: number;
    categoryLabel: string;
    onViewMore: () => void;
    viewAllHref?: string | null;
}) {
    if (total <= 0) return null;
    const shown = Math.min(showingCount, total);
    const canShowMore = shown < total;
    const canViewAll = !canShowMore && typeof viewAllHref === 'string' && viewAllHref.trim().length > 0;
    return (
        <div className="flex flex-row items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
                Showing {shown} {categoryLabel}
            </p>
            {canShowMore ? (
                <Button type="button" variant="ghost" className="h-10 w-auto shrink-0 " onClick={onViewMore}>
                    View More
                </Button>
            ) : canViewAll ? (
                <Button type="button" variant="ghost" className="h-10 w-auto shrink-0" asChild>
                    <a href={viewAllHref || undefined} target="_blank" rel="noopener noreferrer">
                        View All
                    </a>
                </Button>
            ) : null}
        </div>
    );
}
