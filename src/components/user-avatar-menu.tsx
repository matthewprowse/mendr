'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';

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

    if (isLoading) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Account menu"
                >
                    <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
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
                className="w-56 p-3 rounded-md shadow-xl border-input"
            >
                <div className="flex flex-col gap-1">
                    {user?.email && (
                        <>
                            <p className="text-xs text-muted-foreground font-semibold mb-1 truncate">
                                {user.email}
                            </p>
                            <Separator className="my-2" />
                        </>
                    )}

                    {user && (
                        <Button variant="ghost" className="justify-start w-full" asChild>
                            <Link href="/hub/vault" onClick={() => setOpen(false)}>
                                My Hub
                            </Link>
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        className="justify-start w-full"
                        asChild
                    >
                        <Link href={user ? "/hub/settings" : "/auth/login"} onClick={() => setOpen(false)}>
                            Settings
                        </Link>
                    </Button>

                    <Separator className="my-2" />

                    {user ? (
                        <Button
                            variant="ghost"
                            className="justify-start w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleSignOut}
                        >
                            Log out
                        </Button>
                    ) : (
                        <Button variant="ghost" className="justify-start w-full" asChild>
                            <Link href="/auth/login" onClick={() => setOpen(false)}>
                                Login
                            </Link>
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
