'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from '@/lib/icons';

export default function MessageThreadPage() {
    return (
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-8 text-center sm:px-6 lg:px-8">
            <Button variant="ghost" size="icon" asChild className="self-start mb-4">
                <Link href="/app/messages" aria-label="Back to messages">
                    <ArrowLeft className="size-4" />
                </Link>
            </Button>
            <FileText className="size-12 text-muted-foreground/60" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">Job messages disabled</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Job-based messaging is not available in this version of the app. You can still use
                Scandio chat and reports from the Home tab.
            </p>
        </div>
    );
}
