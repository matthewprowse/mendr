'use client';

/**
 * AdminFooter — bottom-of-page navigation for the admin, mirroring the customer
 * AccountTabBar: a full-width sticky bar (bg-background, p-4) with stock shadcn
 * pill `Tabs` centred at max-w-xl, the active value bound to the pathname, each
 * trigger a real Next `<Link>` via Radix `asChild`. The customer bar has 4 tabs
 * plus a centre "start a diagnosis" action; the admin has six top-level sections
 * and no global create action, so we use a single six-up tab row.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const NAV = [
    { href: '/admin', label: 'Home' },
    { href: '/admin/providers', label: 'Providers' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/contact', label: 'Contact' },
] as const;

function resolveActiveHref(pathname: string): string {
    // Longest-prefix-wins so /admin/providers beats /admin (Home). Home matches
    // only the exact /admin path so it doesn't light up on every sub-route.
    let best: string = NAV[0].href;
    let bestLen = -1;
    for (const tab of NAV) {
        const matches =
            tab.href === '/admin'
                ? pathname === '/admin'
                : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        if (matches && tab.href.length > bestLen) {
            best = tab.href;
            bestLen = tab.href.length;
        }
    }
    return best;
}

export function AdminFooter() {
    const pathname = usePathname();
    const active = resolveActiveHref(pathname);
    return (
        <div className="sticky bottom-0 shrink-0 bg-background py-4">
            <Tabs value={active} className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
                <TabsList className="grid h-10 w-full grid-cols-4">
                    {NAV.map((tab) => (
                        <TabsTrigger key={tab.href} value={tab.href} asChild>
                            <Link href={tab.href}>{tab.label}</Link>
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}
