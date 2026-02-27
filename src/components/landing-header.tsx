'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Cross, Menu } from 'geist-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SERVICE_ITEMS, type ServiceLabel } from '@/lib/service-icons';
import { UserAvatarMenu } from '@/components/user-avatar-menu';

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
}: LandingHeaderProps) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

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

    return (
        <>
            <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
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
                    <nav className="ml-auto hidden items-center gap-6 md:flex">
                        {showTrades &&
                            (mounted ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className={`flex items-center gap-1 ${linkClass}`}
                                            aria-label="Services"
                                        >
                                            Services
                                            <ChevronDown size={14} className="opacity-70" />
                                        </button>
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
                                    <ChevronDown size={14} className="opacity-70" />
                                </span>
                            ))}
                        {navLinks.map(({ href, label }) => (
                            <Link key={href} href={href} className={linkClass}>
                                {label}
                            </Link>
                        ))}
                        {ctaHref && ctaLabel && (
                            <Button asChild size="sm">
                                <Link href={ctaHref}>{ctaLabel}</Link>
                            </Button>
                        )}
                        {showCustomerLink && (
                            <Link href="/" className={linkClass}>
                                For Customers
                            </Link>
                        )}
                        <UserAvatarMenu />
                    </nav>
                    <div className="ml-auto flex items-center gap-2 md:hidden">
                        <UserAvatarMenu />
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            className="flex size-9 items-center justify-center"
                            aria-label="Open Mobile Menu"
                        >
                            <Menu size={16} className="text-foreground" />
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
                            <Cross size={16} className="text-foreground" />
                        </button>
                    </div>
                    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-8 sm:px-6">
                        {showTrades && (
                            <div className="space-y-1">
                                <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Services
                                </p>
                                <div className="flex flex-col gap-0.5">
                                    {SERVICE_ITEMS.map(({ label }) => (
                                        <Link
                                            key={label}
                                            href={getServiceChatHref(label)}
                                            onClick={closeMobileNav}
                                            className="w-full rounded-md px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground active:bg-muted"
                                        >
                                            {label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        {navLinks.map(({ href, label }) => (
                            <Link
                                key={href}
                                href={href}
                                onClick={closeMobileNav}
                                className="rounded-lg px-4 py-3 text-base text-center font-medium text-muted-foreground transition-all duration-[250ms] hover:bg-muted/50 hover:text-foreground"
                            >
                                {label}
                            </Link>
                        ))}
                        {showCustomerLink && (
                            <Link
                                href="/"
                                onClick={closeMobileNav}
                                className="rounded-lg px-4 py-3 text-base text-center font-medium text-muted-foreground transition-all duration-[250ms] hover:bg-muted/50 hover:text-foreground"
                            >
                                For Customers
                            </Link>
                        )}
                    </nav>
                    {ctaHref && ctaLabel && (
                        <div className="border-t border-border p-4 sm:p-6">
                            <Button asChild size="default" className="w-full">
                                <Link href={ctaHref} onClick={closeMobileNav}>
                                    {ctaLabel}
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
