'use client';

type UnrelatedImageCardProps = {
    conversationId?: string;
    diagnosisMessage?: string;
    recordFeedback?: boolean;
};

export function UnrelatedImageCard({ diagnosisMessage }: UnrelatedImageCardProps) {
    return (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground">Image not related to a home service issue</p>
            <p className="mt-1 text-sm text-muted-foreground">
                This report appears unrelated to a serviceable repair request.
            </p>
            {diagnosisMessage ? (
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{diagnosisMessage}</p>
            ) : null}
        </section>
    );
}
