'use client';

import { useState } from 'react';
import { ExternalLink, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
        <div className="flex flex-row items-center gap-4 overflow-hidden mt-3 pt-6 border-t border-border">
            <div className="w-14 h-18 bg-secondary rounded-lg" />
            <div className="flex flex-1 flex-col gap-0.5">
                <p className="text-lg font-semibold text-foreground">
                    Scandio Report
                </p>
                <p className="text-sm text-muted-foreground">
                    What&apos;s a Scandio Report?
                </p>
            </div>
            <div className="flex h-9 items-center gap-2">
                <Button
                    type="button"
                    className="h-10 w-10"
                    variant="secondary"
                    size="icon"
                    onClick={handleOpenReport}
                    aria-label="Open report in new tab"
                >
                    <ExternalLink className="size-5" aria-hidden />
                </Button>
                <Button
                    type="button"
                    className="h-10 w-10"
                    variant="secondary"
                    size="icon"
                    onClick={handleShareReport}
                    aria-label="Share report"
                >
                    <Share className="size-5" aria-hidden />
                </Button>
            </div>
        </div>
    );
}
