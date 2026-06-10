'use client';

/**
 * AccountTabBar — bottom-of-page navigation for the customer account routes,
 * with a primary "start a diagnosis" action in the centre.
 *
 * Layout: Home / History · ( + ) · Favourites / Settings. The four nav items
 * use stock shadcn `<Tabs>` (rounded-pill default variant) with the current
 * pathname bound as the active value; each TabsTrigger renders a Next `<Link>`
 * via Radix's asChild so taps are real route changes. The centre button is an
 * action, not a tab — it launches the diagnosis flow at /start and is present
 * on every customer page, so starting a diagnosis is always one tap away.
 *
 * Pathname-prefix matching means /settings/profile still lights up Settings.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const NAV_LEFT = [
    { href: '/home', label: 'Home' },
    { href: '/diagnoses', label: 'History' },
] as const;

const NAV_RIGHT = [
    { href: '/favourites', label: 'Favourites' },
    { href: '/settings', label: 'Settings' },
] as const;

const ALL_TABS = [...NAV_LEFT, ...NAV_RIGHT];

function resolveActiveHref(pathname: string): string {
    // Longest-prefix-wins so /settings/profile picks Settings (length 9) over
    // Home (length 5). Falls back to /home when nothing matches.
    let bestMatch: string = ALL_TABS[0].href;
    let bestLen = -1;
    for (const t of ALL_TABS) {
        if (pathname === t.href || pathname.startsWith(`${t.href}/`)) {
            if (t.href.length > bestLen) {
                bestMatch = t.href;
                bestLen = t.href.length;
            }
        }
    }
    return bestMatch;
}

export function AccountTabBar() {
    const pathname = usePathname();
    const active = resolveActiveHref(pathname);
    return (
        <div className="sticky bottom-0 shrink-0 bg-background p-4">
            <Tabs value={active} className="mx-auto w-full max-w-xl">
                <div className="flex items-center gap-2">
                    <TabsList className="grid h-10 flex-1 grid-cols-2">
                        {NAV_LEFT.map((tab) => (
                            <TabsTrigger key={tab.href} value={tab.href} asChild>
                                <Link href={tab.href}>{tab.label}</Link>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <Button
                        asChild
                        size="icon"
                        className="size-12 shrink-0 rounded-full shadow-md"
                    >
                        <Link href="/start" aria-label="Start a diagnosis">
                            <Plus className="size-5" strokeWidth={2.5} />
                        </Link>
                    </Button>

                    <TabsList className="grid h-10 flex-1 grid-cols-2">
                        {NAV_RIGHT.map((tab) => (
                            <TabsTrigger key={tab.href} value={tab.href} asChild>
                                <Link href={tab.href}>{tab.label}</Link>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
            </Tabs>
        </div>
    );
}
