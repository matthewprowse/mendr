/**
 * Route: /diagnosis/[id]
 * Step 2 of the multi-step scan flow.
 * Renders the diagnosis experience for a given conversation id.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { DiagnosisPageClient } from './diagnosis-page-client';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? 'Diagnosis' : 'Scan Diagnosis',
        description: '',
    };
}

export default async function DiagnosisPage({ params }: PageProps) {
    const { id } = await params;

    if (!id || typeof id !== 'string' || id.trim() === '') {
        redirect('/welcome');
    }

    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen w-full items-center justify-center bg-background">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            }
        >
            <DiagnosisPageClient conversationId={id} />
        </Suspense>
    );
}

