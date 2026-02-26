'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Wrench } from 'geist-icons';
import { sanitizeAiContent } from '@/lib/utils';

type UnservicedCategoryCardProps = {
    conversationId?: string;
    messageId?: string;
    requestedService: string;
    diagnosis?: string;
    diagnosisFull?: Record<string, unknown>;
    onRecorded?: () => void;
    /** When false, skips recording to feedback_unserviced (e.g. on report page view) */
    recordFeedback?: boolean;
};

export function UnservicedCategoryCard({
    conversationId,
    messageId,
    requestedService,
    diagnosis,
    diagnosisFull,
    onRecorded,
    recordFeedback = true,
}: UnservicedCategoryCardProps) {
    const hasRecorded = useRef(false);

    useEffect(() => {
        if (hasRecorded.current || !conversationId || !recordFeedback) return;
        hasRecorded.current = true;
        fetch('/api/feedback/unserviced', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: conversationId,
                message_id: messageId,
                requested_service: requestedService,
                diagnosis: diagnosis || undefined,
                diagnosis_full: diagnosisFull || undefined,
            }),
        })
            .then(() => onRecorded?.())
            .catch(() => {});
    }, [
        conversationId,
        messageId,
        requestedService,
        diagnosis,
        diagnosisFull,
        onRecorded,
        recordFeedback,
    ]);

    return (
        <div className="w-full rounded-lg border border-border bg-card p-5 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Wrench className="size-5 text-muted-foreground" />
                </div>
                <div className="space-y-2 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground">
                        We don&apos;t offer that service yet
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        It looks like you need{' '}
                        <strong className="text-foreground">{requestedService}</strong>. We&apos;re
                        not quite set up for that yet — but we&apos;re expanding. Your request helps
                        us decide which services to add next.
                    </p>
                    {diagnosis && diagnosis !== 'N/A' && (
                        <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                            {sanitizeAiContent(diagnosis)}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
                    Browse other services
                </Button>
            </div>
        </div>
    );
}
