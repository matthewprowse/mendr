'use client';

type UnrelatedImageCardProps = {
    conversationId?: string;
    recordFeedback?: boolean;
};

export function UnrelatedImageCard(_props: UnrelatedImageCardProps) {
    return (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground">Image not related to a home service issue</p>
            <p className="mt-1 text-sm text-muted-foreground">
                This report appears unrelated to a serviceable repair request.
            </p>
        </section>
    );
}
