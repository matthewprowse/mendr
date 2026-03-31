/**
 * Route: /match/[id]
 * Step 3 of the multi-step scan flow.
 * Shows a horizontal carousel of providers for a confirmed diagnosis.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { MatchPageClient } from './match-page-client';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? 'Matches' : 'Provider Matches',
        description: '',
    };
}

export default async function MatchPage({ params }: PageProps) {
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
            <MatchPageClient conversationId={id} />
        </Suspense>
    );
}

