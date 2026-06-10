'use client';

/**
 * SettingsClient — landing page for the Settings tab.
 *
 * Shows a vertical stack of section cards (Card size="sm") that link to each
 * settings sub-page. On desktop the column stays narrow (max-w-xl) — same
 * pattern as Vercel/Linear/Notion settings — no master-detail layout.
 *
 * Logged-out users see a single CTA to log in (deep-link back to /settings).
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';

type Section = {
    href: string;
    title: string;
    description: string;
};

const SECTIONS: Section[] = [
    {
        href: '/settings/account',
        title: 'Account',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
    {
        href: '/settings/addresses',
        title: 'Addresses',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
    {
        href: '/settings/notifications',
        title: 'Notifications',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
    {
        href: '/settings/privacy',
        title: 'Privacy',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
    {
        href: '/settings/support',
        title: 'Support',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
];

export default function SettingsClient() {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => router.back()}
                >
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
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Settings
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to manage your account.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings">
                                            Log In
                                        </Link>
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
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Settings
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                <div className="flex flex-col">
                                    {SECTIONS.map((section, index) => (
                                        <div key={section.href}>
                                            {index > 0 && <Separator />}
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => router.push(section.href)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        router.push(section.href);
                                                    }
                                                }}
                                                className="flex cursor-pointer items-center gap-3 py-3"
                                            >
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="icon"
                                                    className="size-12 shrink-0"
                                                    tabIndex={-1}
                                                    aria-hidden="true"
                                                />
                                                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                    <p className="text-sm font-medium">
                                                        {section.title}
                                                    </p>
                                                    <p className="line-clamp-1 text-xs text-muted-foreground">
                                                        {section.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
