'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClaimWizard } from './_components/claim-wizard';

export default function ProClaimPage() {
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
                <p className="text-muted-foreground text-sm">Loading…</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="border-b border-border px-4 py-3">
                <div className="mx-auto flex max-w-2xl items-center justify-between">
                    <Link href="/pro" className="font-semibold text-foreground">
                        Scandio Pro
                    </Link>
                    <Link href="/pro" className="text-muted-foreground text-sm hover:text-foreground">
                        Back to signup
                    </Link>
                </div>
            </header>
            <main className="flex-1 px-4 py-8">
                <ClaimWizard
                    onComplete={() => {
                        router.replace('/pro/dashboard');
                    }}
                />
            </main>
        </div>
    );
}
