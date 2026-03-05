'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ChevronDown, Cross, IconInstagram, Linkedin, Menu } from '@/lib/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SERVICE_ITEMS, type ServiceLabel } from '@/lib/service-icons';
import { UserAvatarMenu } from '@/components/user-avatar-menu';
import { useAuth } from '@/context/auth-context';
import { Separator } from './ui/separator';

export type NavLink = { href: string; label: string };

function getServiceChatHref(label: ServiceLabel): string {
    const id = crypto.randomUUID();
    const params = new URLSearchParams({ trade: label });
    return `/chat/${id}?${params.toString()}`;
}

type LandingHeaderProps = {
    navLinks: NavLink[];
    logoHref?: string;
    showProBadge?: boolean;
    showCustomerLink?: boolean;
    showTrades?: boolean;
    ctaHref?: string;
    ctaLabel?: string;
    /** Show mobile-only promo card + auth/footer (customer landing) */
    showMobilePromo?: boolean;
    /** Show "Go to App" shortcut on mobile when user is logged in */
    showAppShortcut?: boolean;
    /** Show auth controls (Open App / avatar / login) in header */
    showAuthControls?: boolean;
    /** When true and user is logged in, show avatar menu instead of Open App (e.g. when already in app) */
    useAvatarForLoggedInUser?: boolean;
    /** Show back button linking to this href (e.g. when viewing a chat in app) */
    backHref?: string;
    /** When true, back button only shows on mobile (hidden on desktop) */
    backHrefMobileOnly?: boolean;
};

const linkClass =
    'text-sm text-muted-foreground transition-all duration-[250ms] hover:text-foreground';

export function LandingHeader({
    navLinks,
    logoHref = '/',
    showProBadge = false,
    showCustomerLink = false,
    showTrades = true,
    ctaHref,
    ctaLabel,
    showAppShortcut = true,
    showAuthControls = true,
    useAvatarForLoggedInUser = false,
    backHref,
    backHrefMobileOnly = false,
}: LandingHeaderProps) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [currentHash, setCurrentHash] = useState('');
    const pathname = usePathname();
    const { user, isLoading } = useAuth();

    const closeMobileNav = () => setMobileNavOpen(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mobileNavOpen) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
    }, [mobileNavOpen]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const updateHash = () => setCurrentHash(window.location.hash);
        updateHash();
        window.addEventListener('hashchange', updateHash);
        return () => window.removeEventListener('hashchange', updateHash);
    }, []);

    // Scroll spy: update active section while scrolling on pages that have in-page sections
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Derive section IDs from navLinks that point to the current page
        const sectionIds = navLinks
            .map(({ href }) => {
                if (href.startsWith('#')) {
                    return href.slice(1);
                }
                const [hrefPath, hrefHash] = href.split('#');
                if (hrefPath && hrefPath === pathname && hrefHash) {
                    return hrefHash;
                }
                return null;
            })
            .filter((id): id is string => !!id);

        if (!sectionIds.length) return;

        const elements = sectionIds
            .map((id) => {
                const el = document.getElementById(id);
                return el ? { id, el } : null;
            })
            .filter(
                (entry): entry is { id: string; el: HTMLElement } =>
                    entry !== null
            );

        if (!elements.length) return;

        const headerOffset = 80; // approximate header height

        const handleScroll = () => {
            let activeId = elements[0]?.id;
            let maxTop = -Infinity;

            for (const { id, el } of elements) {
                const rect = el.getBoundingClientRect();
                const top = rect.top;

                // Section whose top has passed the header but is closest to it
                if (top <= headerOffset && top > maxTop) {
                    maxTop = top;
                    activeId = id;
                }
            }

            // If none passed the header yet (top of page), keep first section active
            if (!activeId) {
                activeId = elements[0].id;
            }

            setCurrentHash(`#${activeId}`);
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [navLinks, pathname]);

    const isNavLinkActive = (href: string) => {
        if (!href) return false;

        // Section on current page
        if (href.startsWith('#')) {
            return currentHash === href;
        }

        const [hrefPath, hrefHash] = href.split('#');

        if (hrefPath && pathname === hrefPath) {
            if (!hrefHash) return true;
            return currentHash === `#${hrefHash}`;
        }

        return false;
    };

    return (
        <>
            <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2">
                        {backHref && (
                            <Link
                                href={backHref}
                                className={`flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${backHrefMobileOnly ? 'md:hidden' : 'md:-ml-2'}`}
                                aria-label="Back"
                            >
                                <ArrowLeft className="size-5" />
                            </Link>
                        )}
                        <Link href={logoHref} className="flex items-center gap-2">
                        <Image
                            src="/logo.svg"
                            alt="Scandio"
                            width={36}
                            height={36}
                            className="h-9 w-9 shrink-0 rounded-lg"
                        />
                        <span className="font-semibold">Scandio</span>
                        {showProBadge && (
                            <Badge variant="secondary" className="text-xs">
                                For Pros
                            </Badge>
                        )}
                        </Link>
                    </div>
                    <nav className="ml-auto hidden items-center gap-6 md:flex">
                        <div className="flex items-center gap-3">
                            {showTrades &&
                                (mounted ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                                                aria-label="Services"
                                            >
                                                <span>Services</span>
                                                <ChevronDown className="size-3.5 opacity-70" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="start"
                                            sideOffset={8}
                                            className="min-w-[160px] p-1"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                {SERVICE_ITEMS.map(({ label }) => (
                                                    <Link
                                                        key={label}
                                                        href={getServiceChatHref(label)}
                                                        className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                                    >
                                                        {label}
                                                    </Link>
                                                ))}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <span
                                        className={`flex items-center gap-1 ${linkClass}`}
                                        aria-hidden
                                    >
                                        Services
                                        <ChevronDown className="size-3.5 opacity-70" />
                                    </span>
                                ))}
                            {navLinks.map(({ href, label }) => {
                                const active = isNavLinkActive(href);
                                return (
                                    <Button
                                        key={href}
                                        asChild
                                        variant={active ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className={`text-sm font-medium transition-colors ${
                                            active ? '' : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Link href={href}>{label}</Link>
                                    </Button>
                                );
                            })}
                            {ctaHref && ctaLabel && (
                                <Button asChild size="sm">
                                    <Link href={ctaHref}>{ctaLabel}</Link>
                                </Button>
                            )}
                            {showCustomerLink && (
                                <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                                >
                                    <Link href="/">For Customers</Link>
                                </Button>
                            )}
                        </div>
                        {showAuthControls && !isLoading && (
                            <>
                                {user ? (
                                    useAvatarForLoggedInUser ? (
                                        <UserAvatarMenu />
                                    ) : (
                                        <Button asChild size="sm" variant="secondary">
                                            <Link href="/app/home">Open App</Link>
                                        </Button>
                                    )
                                ) : (
                                    <UserAvatarMenu />
                                )}
                            </>
                        )}
                    </nav>
                    <div className="ml-auto flex items-center gap-2 md:hidden">
                        {showAuthControls &&
                            !isLoading &&
                            (user ? (
                                useAvatarForLoggedInUser ? (
                                    <UserAvatarMenu />
                                ) : (
                                    showAppShortcut && (
                                        <Button asChild size="sm" variant="secondary">
                                            <Link href="/app/scans">Open App</Link>
                                        </Button>
                                    )
                                )
                            ) : (
                                <Button asChild size="sm" variant="secondary">
                                    <Link href="/auth/login">Login</Link>
                                </Button>
                            ))}
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            className="flex size-9 items-center justify-center"
                            aria-label="Open Mobile Menu"
                        >
                            <Menu className="size-4 text-foreground" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Full-screen mobile nav */}
            <div
                className={`fixed inset-0 z-[60] bg-background md:hidden ${mobileNavOpen ? 'visible' : 'hidden'}`}
                aria-hidden={!mobileNavOpen}
            >
                <div className="flex h-full flex-col">
                    <div className="flex h-16 items-center justify-between px-4 sm:px-6">
                        <Link
                            href={logoHref}
                            className="flex items-center gap-2"
                            onClick={closeMobileNav}
                            aria-label="Scandio home"
                        >
                            <Image
                                src="/logo.svg"
                                alt="Scandio"
                                width={36}
                                height={36}
                                className="h-9 w-9 shrink-0 rounded-lg"
                            />
                            <span className="font-semibold">Scandio</span>
                            {showProBadge && (
                                <Badge variant="secondary" className="text-xs">
                                    For Pros
                                </Badge>
                            )}
                        </Link>
                        <button
                            type="button"
                            onClick={closeMobileNav}
                            className="flex size-9 items-center justify-center"
                            aria-label="Close Mobile Menu"
                        >
                            <Cross className="size-4 text-foreground" />
                        </button>
                    </div>
                    <nav className="flex flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 py-4 sm:px-6">
                        {showTrades && (
                            <div className="space-y-2">
                                <p className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                    Services
                                </p>
                                <div className="flex flex-col gap-2">
                                    {SERVICE_ITEMS.map(({ label }) => (
                                        <Link
                                            key={label}
                                            href={getServiceChatHref(label)}
                                            onClick={closeMobileNav}
                                            className="w-full px-0 py-2.5 text-left text-base text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            {label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        {navLinks.map(({ href, label }) => {
                            const active = isNavLinkActive(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    onClick={closeMobileNav}
                                    className={`flex items-center px-0 py-2.5 text-left text-xl font-medium transition-all duration-[250ms] ${
                                        active
                                            ? 'text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {label === 'For Pros' ? 'For Professionals' : label}
                                </Link>
                            );
                        })}
                        {showCustomerLink && logoHref === '/' && (
                            <Link
                                href="/app/home"
                                onClick={closeMobileNav}
                                className="flex h-12 items-center px-0 text-left text-base font-medium text-muted-foreground transition-all duration-[250ms] hover:text-foreground"
                            >
                                Open App
                            </Link>
                        )}

                        {/* Customer landing mobile promo card + auth actions */}
                        {logoHref === '/' && !showProBadge && !user && (
                            <div className="mt-4 space-y-4">
                                <Separator className="mb-12" />
                                <Card className="w-full border-input shadow-none">
                                    <div className="px-4 py-0">
                                        <p className="text-base font-semibold text-foreground">
                                            Get Free Scandio Report
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Scan your maintenance issue in seconds and receive a professional
                                            report you can share with any provider.
                                        </p>
                                    </div>
                                </Card>
                                <div className="flex flex-row gap-3">
                                    <Button asChild variant="secondary" className="flex-1">
                                        <Link href="/auth/login" onClick={closeMobileNav}>
                                            Login
                                        </Link>
                                    </Button>
                                    <Button asChild className="flex-1">
                                        <Link href="/auth/sign-in" onClick={closeMobileNav}>
                                            Join Scandio
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </nav>
                    {/* Mobile nav footer: legal + social for marketing pages */}
                    {true && (
                        <footer className="px-4 py-4 text-sm text-muted-foreground sm:px-6">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Link
                                        href="/privacy"
                                        onClick={closeMobileNav}
                                        className="hover:text-foreground"
                                    >
                                        Privacy
                                    </Link>
                                    <Link
                                        href="/terms"
                                        onClick={closeMobileNav}
                                        className="hover:text-foreground"
                                    >
                                        Terms
                                    </Link>
                                </div>

                                <div className="flex items-center gap-1">
                                    <Link
                                        href="https://instagram.com"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted/50 hover:text-foreground"
                                        aria-label="Instagram"
                                    >
                                        <IconInstagram className="size-5" />
                                    </Link>
                                    <Link
                                        href="https://linkedin.com"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted/50 hover:text-foreground"
                                        aria-label="LinkedIn"
                                    >
                                        <Linkedin className="size-5" aria-hidden />
                                    </Link>
                                </div>
                            </div>
                        </footer>
                    )}
                </div>
            </div>
        </>
    );
}
