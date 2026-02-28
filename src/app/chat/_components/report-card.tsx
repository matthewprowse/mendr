'use client';

import { useState } from 'react';
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
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                    Your Diagnosis Report is Ready
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Share it with your provider before they arrive so they can bring the right parts and quote you accurately.
                </p>
            </div>
            <div className="flex gap-2">
                <Button
                    variant="default"
                    size="sm"
                    onClick={handleShareReport}
                >
                    {copied ? 'Copied' : 'Share Report'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenReport}
                >
                    Open Report
                </Button>
            </div>
        </div>
    );
}
