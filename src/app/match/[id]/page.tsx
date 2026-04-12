import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import MatchLoading from '../loading';
import { fetchReportDetailOnServer } from '@/lib/fetch-report-detail-server';

const MatchPageClient = dynamic(() => import('../client'), {
    loading: () => <MatchLoading />,
});

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const base: Metadata = {
        title: 'Find providers',
        description:
            'Match with local home maintenance providers based on your Scandio diagnosis.',
    };
    const result = await fetchReportDetailOnServer(id);
    if (result.status === 'ok' && result.data.diagnosis) {
        const d = result.data.diagnosis as Record<string, unknown>;
        if (typeof d.diagnosis === 'string' && d.diagnosis && d.diagnosis !== 'N/A') {
            return {
                ...base,
                title: `${d.diagnosis.slice(0, 55)} | Match`,
            };
        }
    }
    return base;
}

export default async function MatchByIdPage({ params }: PageProps) {
    const { id } = await params;
    return <MatchPageClient conversationId={id} />;
}
