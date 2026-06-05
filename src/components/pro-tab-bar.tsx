'use client';

/**
 * ProTabBar — bottom-of-page navigation for the Mendr Pro portal, mirroring the
 * customer AccountTabBar (stock shadcn Tabs, active value bound to the pathname,
 * each trigger a real Next Link). No centre action — Pros do not start
 * diagnoses.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = [
    { href: '/pro/home', label: 'Home' },
    { href: '/pro/leads', label: 'Leads' },
    { href: '/contractors/account', label: 'Account' },
] as const;

function resolveActiveHref(pathname: string): string {
    let bestMatch: string = TABS[0].href;
    let bestLen = -1;
    for (const t of TABS) {
        if (pathname === t.href || pathname.startsWith(`${t.href}/`)) {
            if (t.href.length > bestLen) {
                bestMatch = t.href;
                bestLen = t.href.length;
            }
        }
    }
    return bestMatch;
}

export function ProTabBar() {
    const pathname = usePathname();
    const active = resolveActiveHref(pathname);
    return (
        <div className="sticky bottom-0 shrink-0 bg-background p-4">
            <Tabs value={active} className="mx-auto w-full max-w-xl">
                <TabsList className="grid h-10 w-full grid-cols-3">
                    {TABS.map((tab) => (
                        <TabsTrigger key={tab.href} value={tab.href} asChild>
                            <Link href={tab.href}>{tab.label}</Link>
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}
