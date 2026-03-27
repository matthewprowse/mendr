import Link from 'next/link';
import { ReactNode } from 'react';
import { SignOutButton } from './_components/sign-out-button';

const NAV = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/providers', label: 'Providers' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/contact', label: 'Contact' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Top nav */}
            <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
                    <div className="flex items-center gap-6">
                        <Link href="/admin" className="text-sm font-semibold text-foreground">
                            Scandio <span className="text-muted-foreground font-normal">Admin</span>
                        </Link>
                        <nav className="hidden items-center gap-1 sm:flex">
                            {NAV.map(({ href, label }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <SignOutButton />
                </div>
                {/* Mobile nav */}
                <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
                    {NAV.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </header>

            <main className="flex-1">{children}</main>
        </div>
    );
}
