import { Suspense } from 'react';
import ProcessingPageClient from './client';

type PageProps = {
    params: Promise<{ conversationId: string }>;
};

export default async function ProcessingPage({ params }: PageProps) {
    const { conversationId } = await params;
    return (
        <Suspense fallback={<div className="min-h-dvh" style={{ background: '#FBFAF7' }} />}>
            <ProcessingPageClient conversationId={conversationId} />
        </Suspense>
    );
}
