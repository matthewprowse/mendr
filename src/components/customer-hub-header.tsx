'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, Layout, Message, SettingsSliders } from '@/lib/icons';
import { UserAvatarMenu } from '@/components/user-avatar-menu';

const hubNavLinks = [
    { href: '/hub/vault', label: 'My Vault', icon: Layout },
    { href: '/hub/messages', label: 'Messages', icon: Message },
    { href: '/hub/favourites', label: 'Favourites', icon: Heart },
    { href: '/hub/settings', label: 'Settings', icon: SettingsSliders },
] as const;

const linkClass =
    'text-sm text-muted-foreground transition-all duration-[250ms] hover:text-foreground flex items-center gap-2';

export function CustomerHubHeader() {
    return (
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/logo.svg"
                        alt="Scandio"
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-lg"
                    />
                    <span className="font-semibold">Scandio</span>
                </Link>
                <nav className="ml-auto hidden items-center gap-6 md:flex">
                    {hubNavLinks.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} className={linkClass}>
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {label}
                        </Link>
                    ))}
                    <UserAvatarMenu />
                </nav>
            </div>
        </header>
    );
}
