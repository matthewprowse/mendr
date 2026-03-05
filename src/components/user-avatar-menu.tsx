'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { Heart, Layout, LogOut, Settings, iconSize } from '@/lib/icons';

export function UserAvatarMenu() {
    const [open, setOpen] = useState(false);
    const { user, signOut, isLoading } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        setOpen(false);
        await signOut();
        router.push('/');
    };

    const initials = user?.email
        ? user.email.slice(0, 2).toUpperCase()
        : user?.user_metadata?.full_name
          ? (user.user_metadata.full_name as string)
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
          : null;

    // Do not render avatar/menu at all while auth is loading or when user is not logged in.
    if (isLoading || !user) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Account menu"
                >
                    <Avatar className="h-9 w-9 cursor-pointer transition-opacity hover:opacity-90">
                        <AvatarFallback className="h-9 w-9 bg-secondary text-secondary-foreground text-xs font-semibold">
                            {initials ?? ''}
                        </AvatarFallback>
                    </Avatar>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={8}
                side="bottom"
                className="w-54 rounded-md border-input/75 bg-popover shadow-none"
            >

                <div className="flex items-center gap-0.5 p-1 -mx-2 pb-3 -mt-2 border-b border-input/75 mb-3">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-foreground">Matthew Prowse</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {user.email ?? 'Account'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-1 p-1 -mx-2 pb-3 -mt-1">
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/home" onClick={() => setOpen(false)}>
                            Home
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/scans" onClick={() => setOpen(false)}>
                            Scans
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/favourites" onClick={() => setOpen(false)}>
                            Favourites
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/settings" onClick={() => setOpen(false)}>
                            Settings
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col gap-1 border-t border-input/75 pt-3 pb-3 -mx-1">
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/settings" onClick={() => setOpen(false)}>
                            Terms
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-8 w-full justify-start px-3 text-sm font-normal text-muted-foreground hover:text-foreground transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/settings" onClick={() => setOpen(false)}>
                            Privacy Policy
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col gap-1 border-t border-input/75 pt-3 -mx-1 -mb-1">
                    <Button
                        variant="secondary"
                        className="h-8 w-full justify-start px-3 text-sm font-normal transition-all duration-250"
                        asChild
                    >
                        <Link href="/app/settings" onClick={() => setOpen(false)}>
                            Log Out
                        </Link>
                    </Button>
                </div>

            </PopoverContent>
        </Popover>
    );
}
