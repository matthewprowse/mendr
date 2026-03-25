'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

type LandingHeaderLink = {
    href: string;
    label: string;
};

type LandingHeaderProps = {
    navLinks: LandingHeaderLink[];
    logoHref?: string;
    showTrades?: boolean;
    rightSlot?: React.ReactNode;
};

export function LandingHeader({
    navLinks,
    logoHref = '/',
    showTrades = false,
    rightSlot,
}: LandingHeaderProps) {
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!mobileOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [mobileOpen]);

    const allLinks = [
        ...navLinks,
        ...(showTrades ? [{ href: '#all-services', label: 'Trades' }] : []),
    ];

    return (
        <>
            <header
                className={cn(
                    'sticky top-0 z-100 bg-background',
                    mobileOpen ? 'border-border/50' : 'border-border/50'
                )}
            >
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link
                        href={logoHref}
                        className="text-lg font-semibold text-foreground"
                        onClick={() => setMobileOpen(false)}
                    >
                        Scandio
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden items-center gap-5 md:flex">
                        {allLinks.map((link) => (
                            <Link
                                key={`${link.href}-${link.label}`}
                                href={link.href}
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        {rightSlot && (
                            <div className="flex items-center">{rightSlot}</div>
                        )}

                        {/* Mobile hamburger */}
                        <Button
                            variant="ghost"
                            className="h-10 w-10"
                            onClick={() => setMobileOpen((v) => !v)}
                            aria-label={mobileOpen ? 'Close Menu' : 'Open Menu'}
                        >
                            {mobileOpen ? (
                                <X className="size-5" />
                            ) : (
                                <Menu className="size-5" />
                            )}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Full-screen mobile nav */}
            {mobileOpen && (
                <div className="fixed inset-0 z-[64] flex flex-col bg-background md:hidden mt-16">
                    {/* Spacer for header height */}

                    <nav className="flex flex-1 flex-col gap-12 p-4 justify-center">
                        {allLinks.map((link) => {
                            const key = `${link.href}-${link.label}`;
                            const className =
                                'text-2xl text-foreground font-semibold';
                            if (link.href.startsWith('#')) {
                                return (
                                    <a
                                        key={key}
                                        href={link.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={className}
                                    >
                                        {link.label}
                                    </a>
                                );
                            }

                            return (
                                <Link
                                    key={key}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={className}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex p-4">
                        <Button
                            variant="default"
                            className="h-10 w-full"
                        >
                            Generate Free Scandio Report
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
