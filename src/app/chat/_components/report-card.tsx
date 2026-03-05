'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Share } from '@/lib/icons';

interface ReportCardProps {
    conversationId: string;
}

export function ReportCard({ conversationId }: ReportCardProps) {
    const [copied, setCopied] = useState(false);

    const reportUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/report/${conversationId}`
            : `/report/${conversationId}`;

    const handleOpenReport = () => {
        window.open(`/report/${conversationId}`, '_blank');
    };

    const handleShareReport = async () => {
        const url =
            typeof window !== 'undefined'
                ? `${window.location.origin}/report/${conversationId}`
                : reportUrl;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'My Scandio Diagnosis Report',
                    text: 'Here is my home diagnosis report from Scandio.',
                    url,
                });
            } catch {
                await copyToClipboard(url);
            }
        } else {
            await copyToClipboard(url);
        }
    };

    const copyToClipboard = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success('Report link copied to clipboard');
            setTimeout(() => setCopied(false), 2500);
        } catch {
            toast.error('Could not copy link');
        }
    };

    return (
        <div className="flex flex-col overflow-hidden">
            <div className="flex flex-1 flex-col gap-1">
                <p className="text-base font-semibold text-foreground">
                    Scandio Report
                </p>
                <p className="text-sm text-muted-foreground">
                    Send the link to your provider before they come. They can quote accurately and show up with the right parts. Sharing your Scandio Report helps them prepare the right materials and give you a clearer quote.
                </p>
            </div>
            <div className="flex h-9 items-center gap-2 mt-3">
                <Button onClick={handleOpenReport} variant="secondary" size="sm">
                    Open Report
                </Button>
                <button
                    type="button"
                    onClick={handleShareReport}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    title={copied ? 'Copied' : 'Share report'}
                    aria-label={copied ? 'Copied' : 'Share report'}
                >
                    <Share className="size-4" />
                </button>
            </div>
        </div>
    );
}
