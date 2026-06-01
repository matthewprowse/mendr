'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';

export type Prefs = {
    followup_enabled: boolean;
    rating_enabled: boolean;
    reengagement_enabled: boolean;
    product_updates_enabled: boolean;
};

const NOTIF_ROWS: { id: keyof Prefs; label: string; description: string }[] = [
    {
        id: 'followup_enabled',
        label: 'Follow-Up Reminders',
        description: 'We remind you to act on a request if you have not contacted a contractor within 3 days.',
    },
    {
        id: 'rating_enabled',
        label: 'Job Rating Requests',
        description: 'We ask you to rate a contractor 48 hours after you have contacted them.',
    },
    {
        id: 'reengagement_enabled',
        label: 'Re-Engagement Emails',
        description: 'Occasional nudges when you have not posted a request in a while.',
    },
    {
        id: 'product_updates_enabled',
        label: 'Product Updates',
        description: 'Get an email when we ship a major new feature on Mendr.',
    },
];

export default function NotificationsClient({ initialPrefs }: { initialPrefs?: Prefs }) {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [prefs, setPrefs] = useState<Prefs | null>(initialPrefs ?? null);

    useEffect(() => {
        if (initialPrefs !== undefined) return; // server already provided data
        if (!isLoggedIn) return;
        fetch('/api/account/notification-preferences')
            .then(r => r.ok ? r.json() : null)
            .then((data: Prefs | null) => { if (data) setPrefs(data); })
            .catch(() => null);
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (id: keyof Prefs) => {
        if (!prefs) return;
        const next = { ...prefs, [id]: !prefs[id] };
        setPrefs(next);
        await fetch('/api/account/notification-preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [id]: next[id] }),
        });
    };

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button type="button" variant="ghost" size="icon" aria-label="Go back" onClick={() => router.back()}>
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
                                        <p className="text-sm text-muted-foreground">Log in to manage how we contact you.</p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/notifications">Log In</Link>
                                    </Button>
                                </div>
                            </div>
                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                    </p>
                                </div>

                                {prefs === null ? (
                                    /*
                                     * SKELETON — mirrors the notification toggle rows and
                                     * Unsubscribe button rendered when prefs load.
                                     * Each row: size-12 icon · label (text-sm) + description
                                     * (text-xs) · Switch (h-[1.15rem] w-8, rounded-full).
                                     * Row count matches NOTIF_ROWS (currently 4).
                                     * ⚠️ If you add/remove rows in NOTIF_ROWS, or change the
                                     * row layout, update this skeleton to match so there is no
                                     * layout shift when data arrives.
                                     */
                                    <>
                                        <div className="flex flex-col">
                                            {[0, 1, 2, 3].map((i) => (
                                                <Fragment key={i}>
                                                    {i > 0 && <Separator />}
                                                    <div className="flex items-center gap-3 py-3">
                                                        <Skeleton className="size-12 shrink-0 rounded-md" />
                                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                            <Skeleton className="h-3.5 w-2/5 rounded" />
                                                            <Skeleton className="h-3 w-4/5 rounded" />
                                                        </div>
                                                        <Skeleton className="h-[1.15rem] w-8 shrink-0 rounded-full" />
                                                    </div>
                                                </Fragment>
                                            ))}
                                        </div>
                                        <Skeleton className="h-10 w-full rounded-md" />
                                    </>
                                ) : (
                                    <>
                                        {/* Toggle rows */}
                                        <div className="flex flex-col">
                                            {NOTIF_ROWS.map((row, index) => (
                                                <div key={row.id}>
                                                    {index > 0 && <Separator />}
                                                    <div className="flex items-center gap-3 py-3">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="icon"
                                                            className="size-12 shrink-0"
                                                            tabIndex={-1}
                                                            aria-hidden="true"
                                                        />
                                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                            <p className="text-sm font-medium">{row.label}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                            </p>
                                                        </div>
                                                        <Switch
                                                            checked={prefs[row.id]}
                                                            onCheckedChange={() => toggle(row.id)}
                                                            aria-label={row.label}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Unsubscribe */}
                                        <Button variant="secondary" className="w-full">
                                            Unsubscribe
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
