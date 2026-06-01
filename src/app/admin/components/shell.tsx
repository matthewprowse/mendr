'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AdminTopBar } from './top-bar';
import { AdminFooter } from './footer';

export function AdminShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    // The login page lives inside the /admin tree but renders without the
    // app chrome. Each admin page enforces auth via requireAdminPage.
    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-svh flex-col bg-background">
            <AdminTopBar />
            <main className="flex-1">{children}</main>
            <AdminFooter />
        </div>
    );
}
