'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/auth-context';

/**
 * Shared right-side header control — identical to the /start page header so the
 * diagnosis, match, and contractor-profile pages all match it exactly:
 *  - signed in  → avatar dropdown (History · Favourites · Settings · Log Out)
 *  - signed out → a small "Login" button
 */
export function HeaderAuth() {
    const router = useRouter();
    const { user, signOut } = useAuth();

    // Show the avatar only for real users, not anonymous Supabase sessions.
    const isLoggedIn = !!user && !!user.email;
    const userMeta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
    const avatarUrl = userMeta.avatar_url || userMeta.picture;
    const displayName = userMeta.full_name || userMeta.name || user?.email || '';
    const initials = displayName
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const handleSignOut = useCallback(async () => {
        await signOut();
        router.push('/');
    }, [router, signOut]);

    if (!isLoggedIn) {
        return (
            <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">Login</Link>
            </Button>
        );
    }

    return (
        <DropdownMenu key="menu">
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Account menu"
                    className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Avatar>
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                        <AvatarFallback>{initials || '?'}</AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <Link href="/diagnoses">History</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/favourites">Favourites</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>Log Out</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
