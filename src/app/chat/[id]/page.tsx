/**
 * File: page.tsx
 * Description: Server Component wrapper for the chat results page.
 * Route: /chat/[id]
 * Handles metadata and passes conversationId to the Client Component.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ChatPageClient } from '../_components/chat-page-client';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? `Scandio: Diagnosis` : 'Scandio: Chat',
        description: '',
    };
}

export default async function ChatPage({ params }: PageProps) {
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
            <ChatPageClient conversationId={id} />
        </Suspense>
    );
}
