'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// Full-screen flows render their own FlowTopBar chrome and must NOT sit under the
// portal's top nav (it adds height that pushes the sticky footer off-screen and
// duplicates the header). Account/dashboard pages keep the nav.
const FULLSCREEN_PREFIXES = ['/contractors/network', '/contractors/application'];

export default function ContractorPortalLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? '';
    const hideNav = FULLSCREEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    if (hideNav) return <>{children}</>;

    return (
        <>
            <nav className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
                <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
                    <a
                        href="/contractors"
                        className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                    >
                        Mendr Contractors
                    </a>
                    <a
                        href="/contractors/account"
                        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                    >
                        My Account
                    </a>
                </div>
            </nav>
            {children}
        </>
    );
}
