'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Layout, Menu, Settings } from '@/lib/icons';

const hubNavLinks = [
    { href: '/app/scans', label: 'Scans', icon: Layout },
    { href: '/app/messages', label: 'Messages', icon: Menu },
    { href: '/app/favourites', label: 'Favourites', icon: Heart },
    { href: '/app/settings', label: 'Settings', icon: Settings },
] as const;

export function CustomerHubFooter() {
    const pathname = usePathname();

    return (
        <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur md:hidden">
            <nav className="mx-auto flex max-w-7xl items-center justify-around px-2 py-2 safe-area-pb">
                {hubNavLinks.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href || (href !== '/app/scans' && pathname.startsWith(href.replace('/hub', '/app')));
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-xs transition-colors ${
                                isActive
                                    ? 'text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Icon className="size-5 shrink-0" aria-hidden />
                            {label}
                        </Link>
                    );
                })}
            </nav>
        </footer>
    );
}
