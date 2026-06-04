'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/auth-context';

/**
 * Account menu for the contractor (Mendr Pro) surfaces — mirrors the customer
 * avatar dropdown on /start, but links to the authenticated contractor pages.
 *
 * Returns null when no user is signed in, so callers never need to guard.
 */

const PRO_PAGES = [
    { label: 'Account', href: '/contractors/account' },
    { label: 'Reviews', href: '/contractors/account/reviews' },
    { label: 'Service Area', href: '/contractors/account/service-area' },
] as const;

export function ProAccountMenu() {
    const { user, signOut } = useAuth();
    const router = useRouter();

    const handleSignOut = useCallback(async () => {
        await signOut();
        router.push('/');
    }, [signOut, router]);

    if (!user) return null;

    const firstName = (user.user_metadata?.first_name ?? '') as string;
    const surname = (user.user_metadata?.surname ?? '') as string;
    const avatarUrl = (user.user_metadata?.avatar_url ?? '') as string;
    const email = user.email ?? '';

    let initials = '';
    if (firstName && surname) {
        initials = `${firstName[0]}${surname[0]}`.toUpperCase();
    } else if (firstName) {
        initials = firstName[0].toUpperCase();
    } else if (email) {
        initials = email[0].toUpperCase();
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Account menu"
                    className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Avatar>
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={firstName || email} /> : null}
                        <AvatarFallback>{initials || '?'}</AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {PRO_PAGES.map((page) => (
                    <DropdownMenuItem asChild key={page.href}>
                        <Link href={page.href}>{page.label}</Link>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>Log Out</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
