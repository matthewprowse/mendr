'use client';

import { FileText } from '@/lib/icons';

export default function MessagesListPage() {
    return (
        <div className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center">
            <FileText className="size-12 text-muted-foreground/60" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">Messages</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Direct messaging with Pros is coming soon. For now, you can use Scandio chat and
                reports from the Home tab.
            </p>
        </div>
    );
}
