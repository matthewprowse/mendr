/**
 * Route: /diagnosis
 * Diagnosis step (formerly implemented as `/diagnosis/[id]`).
 *
 * Expects `?id=<conversationId>` in the URL.
 */

'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { DiagnosisPageClient } from './[id]/diagnosis-page-client';

export default function DiagnosisPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const id = searchParams.get('id');
    const conversationId = typeof id === 'string' ? id.trim() : '';

    useEffect(() => {
        if (!conversationId) router.replace('/welcome');
    }, [conversationId, router]);

    if (!conversationId) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-background">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    return <DiagnosisPageClient conversationId={conversationId} />;
}

