'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

type UnrelatedImageCardProps = {
    conversationId?: string;
    messageId?: string;
    diagnosisMessage?: string;
    onRecorded?: () => void;
    /** When false, skips recording to feedback_unrelated (e.g. on report page view) */
    recordFeedback?: boolean;
};

export function UnrelatedImageCard({
    conversationId,
    messageId,
    diagnosisMessage,
    onRecorded,
    recordFeedback = true,
}: UnrelatedImageCardProps) {
    const hasRecorded = useRef(false);

    useEffect(() => {
        if (hasRecorded.current || !conversationId || !recordFeedback) return;
        hasRecorded.current = true;
        fetch('/api/feedback/unrelated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: conversationId,
                message_id: messageId,
                diagnosis_message: diagnosisMessage || undefined,
            }),
        })
            .then(() => onRecorded?.())
            .catch(() => {});
    }, [conversationId, messageId, diagnosisMessage, onRecorded, recordFeedback]);

    return (
        <div className="w-full space-y-4 animate-in fade-in duration-300">
            <h3 className="text-xl font-semibold text-foreground">
                Not a Home Maintenance Image
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
                Scandio helps with home repairs and maintenance, things like plumbing,
                electrical, gates, painting, and more. Upload a photo of an issue in your
                home and we&apos;ll diagnose it and suggest local specialists.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
                Upload a new image below using the attachment button, or start fresh from the home
                page.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
                    Start Over
                </Button>
            </div>
        </div>
    );
}
