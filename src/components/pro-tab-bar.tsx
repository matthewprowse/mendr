'use client';

/**
 * ProTabBar — bottom-of-page navigation for the Mendr Pro portal. Four primary
 * tabs plus a "More" popover for the overflow sections (Jobs, and later Quotes /
 * Invoices / Team). Mobile-focused for now; a desktop sidebar comes later.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PRIMARY = [
    { href: '/pro/home', label: 'Home' },
    { href: '/pro/leads', label: 'Leads' },
    { href: '/pro/customers', label: 'Customers' },
    { href: '/contractors/account', label: 'Account' },
] as const;

const MORE = [{ href: '/pro/jobs', label: 'Jobs' }] as const;

function matches(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveActiveHref(pathname: string): string {
    let bestMatch: string = PRIMARY[0].href;
    let bestLen = -1;
    for (const t of PRIMARY) {
        if (matches(pathname, t.href) && t.href.length > bestLen) {
            bestMatch = t.href;
            bestLen = t.href.length;
        }
    }
    return bestMatch;
}

export function ProTabBar() {
    const pathname = usePathname();
    const onMore = MORE.some((m) => matches(pathname, m.href));
    const active = resolveActiveHref(pathname);

    return (
        <div className="sticky bottom-0 shrink-0 bg-background p-4">
            <div className="mx-auto flex w-full max-w-xl items-center gap-2">
                <Tabs value={onMore ? '' : active} className="min-w-0 flex-1">
                    <TabsList className="grid h-10 w-full grid-cols-4">
                        {PRIMARY.map((tab) => (
                            <TabsTrigger key={tab.href} value={tab.href} asChild>
                                <Link href={tab.href}>{tab.label}</Link>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant={onMore ? 'default' : 'secondary'}
                            className="h-10 shrink-0 px-4"
                        >
                            More
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="top" className="w-44 p-1">
                        <div className="flex flex-col">
                            {MORE.map((m) => (
                                <Link
                                    key={m.href}
                                    href={m.href}
                                    className="rounded-sm px-3 py-2 text-sm text-foreground hover:bg-secondary"
                                >
                                    {m.label}
                                </Link>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
