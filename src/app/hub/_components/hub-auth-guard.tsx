'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Spinner } from '@/components/ui/spinner';

export function HubAuthGuard({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace(`/auth/login?next=${encodeURIComponent('/hub/vault')}`);
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return <>{children}</>;
}
