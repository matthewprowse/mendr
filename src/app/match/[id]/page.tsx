import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import MatchLoading from '../loading';
import { fetchReportDetailOnServer } from '@/lib/fetch-report-detail-server';
import { buildMatchMeta } from '@/lib/site-metadata';

const MatchPageClient = dynamic(() => import('../client'), {
    loading: () => <MatchLoading />,
});

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const result = await fetchReportDetailOnServer(id);
    if (result.status === 'ok' && result.data.diagnosis) {
        const d = result.data.diagnosis as Record<string, unknown>;
        if (typeof d.diagnosis === 'string' && d.diagnosis && d.diagnosis !== 'N/A') {
            return buildMatchMeta(d.diagnosis);
        }
    }
    return buildMatchMeta(null);
}

export default async function MatchByIdPage({ params }: PageProps) {
    const { id } = await params;
    return <MatchPageClient conversationId={id} />;
}
