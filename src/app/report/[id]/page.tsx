/**
 * Server Component wrapper for the report detail page.
 * Route: /report/[id]
 * Reports are public and shareable by URL.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ReportDetailContent } from './components/report-detail-content';
import { fetchReportDetailOnServer } from '@/lib/diagnosis/fetch-report-detail-server';
import { buildReportMeta } from '@/lib/site-metadata';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const result = await fetchReportDetailOnServer(id);
    if (result.status === 'ok' && result.data.diagnosis) {
        const d = result.data.diagnosis as Record<string, unknown>;
        if (typeof d.diagnosis === 'string' && d.diagnosis && d.diagnosis !== 'N/A') {
            return buildReportMeta(d.diagnosis);
        }
    }
    return buildReportMeta(null);
}

export default async function ReportDetailPage({ params }: PageProps) {
    const { id } = await params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
        redirect('/');
    }

    const serverResult = await fetchReportDetailOnServer(id);

    return <ReportDetailContent reportId={id} serverResult={serverResult} />;
}
