/**
 * Server Component wrapper for the provider report detail page.
 * Route: /report/[id]
 * Passes reportId and token (from searchParams) to the Client Component.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ReportDetailContent } from './_components/report-detail-content';

type PageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ t?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? `Job Report | Scandio` : 'Report | Scandio',
        description: 'View job report and diagnosis for home maintenance services.',
    };
}

export default async function ReportDetailPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { t: token } = await searchParams;

    if (!id || typeof id !== 'string' || id.trim() === '') {
        redirect('/');
    }

    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen w-full items-center justify-center bg-background">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            }
        >
            <ReportDetailContent reportId={id} token={token ?? null} />
        </Suspense>
    );
}
