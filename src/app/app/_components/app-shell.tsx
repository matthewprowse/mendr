'use client';

import type React from 'react';
import { HubAuthGuard } from '../../hub/_components/hub-auth-guard';
import { LandingHeader } from '@/components/landing-header';
import { cn } from '@/lib/utils';

interface AppShellProps {
    className?: string;
    children: React.ReactNode;
}

const APP_NAV_LINKS = [
    { href: '/app/home', label: 'Home' },
    { href: '/app/scans', label: 'Scans' },
    { href: '/app/favourites', label: 'Favourites' },
    { href: '/app/settings', label: 'Settings' },
];

export function AppShell({ className, children }: AppShellProps) {
    return (
        <div className={cn('flex min-h-screen flex-col bg-background', className)}>
            <LandingHeader
                navLinks={APP_NAV_LINKS}
                logoHref="/app/home"
                showTrades={false}
                useAvatarForLoggedInUser
            />
            <main className="flex min-h-0 flex-1 flex-col">
                <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
                    <HubAuthGuard>{children}</HubAuthGuard>
                </div>
            </main>
        </div>
    );
}

