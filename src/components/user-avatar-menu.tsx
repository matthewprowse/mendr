'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ClockRewind, SettingsGear, Logout, User } from 'geist-icons';
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
                    <Avatar className="cursor-pointer hover:opacity-80 transition-opacity">
                        <AvatarFallback className="bg-foreground text-background text-xs font-semibold">
                            {initials ?? <User size={14} />}
                        </AvatarFallback>
                    </Avatar>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-52 p-2">
                {user?.email && (
                    <>
                        <div className="px-2 py-1.5">
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <div className="my-1 h-px bg-border" />
                    </>
                )}
                <Link href="/dashboard/history" onClick={() => setOpen(false)}>
                    <Button
                        variant="ghost"
                        className="w-full justify-start h-9 gap-2.5 text-sm font-normal"
                    >
                        <ClockRewind size={15} className="text-muted-foreground" />
                        History
                    </Button>
                </Link>
                <Link href="/auth/sign-in" onClick={() => setOpen(false)}>
                    <Button
                        variant="ghost"
                        className="w-full justify-start h-9 gap-2.5 text-sm font-normal"
                    >
                        <SettingsGear size={15} className="text-muted-foreground" />
                        Settings
                    </Button>
                </Link>
                <div className="my-1 h-px bg-border" />
                {user ? (
                    <Button
                        variant="ghost"
                        className="w-full justify-start h-9 gap-2.5 text-sm font-normal text-destructive hover:text-destructive"
                        onClick={handleSignOut}
                    >
                        <Logout size={15} />
                        Log out
                    </Button>
                ) : (
                    <Link href="/auth/sign-in" onClick={() => setOpen(false)}>
                        <Button
                            variant="ghost"
                            className="w-full justify-start h-9 gap-2.5 text-sm font-normal"
                        >
                            <User size={15} className="text-muted-foreground" />
                            Sign in
                        </Button>
                    </Link>
                )}
            </PopoverContent>
        </Popover>
    );
}
