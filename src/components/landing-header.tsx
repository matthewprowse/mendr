'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { UserAvatarMenu } from '@/components/user-avatar-menu';
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
    logoBadge?: React.ReactNode;
    mobileCtaHref?: string;
    mobileCtaLabel?: string;
};

export function LandingHeader({
    navLinks,
    logoHref = '/',
    showTrades = false,
    rightSlot,
    logoBadge,
    mobileCtaHref = '/start',
    mobileCtaLabel = 'Generate Free Mendr Report',
}: LandingHeaderProps) {
    const pathname = usePathname();
    const { user, isLoading: authLoading } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const closeMenu = () => setMobileOpen(false);
        window.addEventListener('hashchange', closeMenu);
        return () => window.removeEventListener('hashchange', closeMenu);
    }, []);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

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
    const toggleMobileMenu = () => setMobileOpen((v) => !v);

    return (
        <>
            <header
                className={cn(
                    'sticky top-0 z-[110] bg-background',
                    mobileOpen ? 'border-border/50' : 'border-border/50'
                )}
            >
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link
                        href={logoHref}
                        className="flex items-center gap-2 text-lg font-semibold text-foreground"
                        onClick={() => setMobileOpen(false)}
                    >
                        <span>Mendr</span>
                        {logoBadge}
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

                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="hidden md:flex items-center gap-2">
                            {authLoading ? (
                                <div
                                    className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted"
                                    aria-hidden
                                />
                            ) : user ? (
                                <UserAvatarMenu />
                            ) : null}
                        </div>
                        {rightSlot && (
                            <div className="flex items-center">{rightSlot}</div>
                        )}

                        {/* Mobile menu */}
                        <Button
                            variant="secondary"
                            size="icon"
                            className="md:hidden relative z-[120] h-10 w-10 shrink-0 touch-manipulation"
                            onPointerUp={(e) => {
                                e.preventDefault();
                                toggleMobileMenu();
                            }}
                            aria-label={mobileOpen ? 'Close Menu' : 'Open Menu'}
                            type="button"
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

            {/* Mobile nav — full viewport overlay (header stays on top via z-index) */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background md:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Site menu"
                >
                    <div className="flex min-h-[100dvh] flex-col pt-16">
                        <nav className="flex flex-col gap-1 px-4">
                            {allLinks.map((link) => {
                                const key = `${link.href}-${link.label}`;
                                const className =
                                    'rounded-md px-3 py-3 text-lg font-medium text-foreground hover:bg-muted/60';
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

                        <div className="mt-auto flex p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            <Button asChild variant="default" className="h-10 w-full text-sm">
                                <Link href={mobileCtaHref} onClick={() => setMobileOpen(false)}>
                                    {mobileCtaLabel}
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
