'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const NAV = [
    { href: '/admin', label: 'Home' },
    { href: '/admin/providers', label: 'Providers' },
    { href: '/admin/reviews', label: 'Reviews' },
    { href: '/admin/gallery', label: 'Gallery' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/contact', label: 'Contact' },
];

export function AdminHeader() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    return (
        <>
            <header className="sticky top-0 z-[100] bg-background/95 backdrop-blur">
                <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
                    <Link href="/admin" className="justify-self-start flex items-center gap-2 text-lg font-semibold text-foreground">
                        <span>Scandio</span>
                        <Badge variant="secondary">Admin</Badge>
                    </Link>

                    <nav className="col-start-2 hidden items-center justify-center gap-5 md:flex">
                        {NAV.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`text-sm transition-colors ${
                                        isActive
                                            ? 'font-medium text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <Button
                        variant="secondary"
                        size="icon"
                        className="col-start-3 relative z-[120] h-10 w-10 shrink-0 justify-self-end md:hidden"
                        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                        onClick={() => setMobileOpen((v) => !v)}
                    >
                        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                    </Button>
                </div>
            </header>

            {mobileOpen && (
                <div className="fixed inset-x-0 top-16 z-[90] bg-background/95 backdrop-blur md:hidden">
                    <nav className="flex flex-col gap-1 p-4">
                        {NAV.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`rounded-md px-3 py-2 text-base font-medium ${
                                        isActive
                                            ? 'bg-muted text-foreground'
                                            : 'text-foreground hover:bg-muted/60'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            )}
        </>
    );
}
