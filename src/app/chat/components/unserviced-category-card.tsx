'use client';

type UnservicedCategoryCardProps = {
    conversationId?: string;
    requestedService?: string;
    diagnosis?: string;
    diagnosisFull?: Record<string, unknown>;
    recordFeedback?: boolean;
};

export function UnservicedCategoryCard({
    requestedService,
    diagnosis,
}: UnservicedCategoryCardProps) {
    return (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground">Service category currently unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
                {requestedService
                    ? `We do not currently route providers for ${requestedService}.`
                    : 'We do not currently route providers for this category.'}
            </p>
            {diagnosis ? (
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{diagnosis}</p>
            ) : null}
        </section>
    );
}
