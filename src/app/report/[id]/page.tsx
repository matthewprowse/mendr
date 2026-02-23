/**
 * Server Component wrapper for the report detail page.
 * Route: /report/[id]
 * Reports are public and shareable by URL.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ReportDetailContent } from './_components/report-detail-content';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? `Scandio: Job Report` : 'Scandio: Job Report',
        description: '',
    };
}

export default async function ReportDetailPage({ params }: PageProps) {
    const { id } = await params;

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
            <ReportDetailContent reportId={id} />
        </Suspense>
    );
}
