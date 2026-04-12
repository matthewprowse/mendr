import type { Metadata } from 'next';

import DiagnosisPageClient from '../client';
import { fetchConversationDiagnosisAdmin } from '@/lib/fetch-conversation-diagnosis-server';
import { fetchReportDetailOnServer } from '@/lib/fetch-report-detail-server';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const base: Metadata = {
        title: 'Your Diagnosis',
        description:
            'Review your home maintenance diagnosis on Scandio. Check what we found from your photo, add context if needed, and continue to find a specialist.',
    };
    const result = await fetchReportDetailOnServer(id);
    if (result.status === 'ok' && result.data.diagnosis) {
        const d = result.data.diagnosis as Record<string, unknown>;
        if (typeof d.diagnosis === 'string' && d.diagnosis && d.diagnosis !== 'N/A') {
            return {
                ...base,
                title: `${d.diagnosis.slice(0, 55)} | Your Diagnosis`,
            };
        }
    }
    return base;
}

export default async function DiagnosisIdPage({ params }: PageProps) {
    const { id } = await params;
    const prefetchedConversation = await fetchConversationDiagnosisAdmin(id);

    return <DiagnosisPageClient conversationId={id} prefetchedConversation={prefetchedConversation} />;
}
