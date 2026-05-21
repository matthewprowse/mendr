import type { Metadata } from 'next';

import DiagnosisPageClient from '../client';
import { fetchConversationDiagnosisAdmin } from '@/lib/diagnosis/fetch-conversation-diagnosis-server';
import { fetchReportDetailOnServer } from '@/lib/diagnosis/fetch-report-detail-server';
import { buildDiagnosisMeta } from '@/lib/site-metadata';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const result = await fetchReportDetailOnServer(id);
    if (result.status === 'ok' && result.data.diagnosis) {
        const d = result.data.diagnosis as Record<string, unknown>;
        if (typeof d.diagnosis === 'string' && d.diagnosis && d.diagnosis !== 'N/A') {
            return buildDiagnosisMeta(d.diagnosis);
        }
    }
    return buildDiagnosisMeta(null);
}

export default async function DiagnosisIdPage({ params }: PageProps) {
    const { id } = await params;
    const prefetchedConversation = await fetchConversationDiagnosisAdmin(id);

    return <DiagnosisPageClient conversationId={id} prefetchedConversation={prefetchedConversation} />;
}
