'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';

const EXPORT_ITEMS = [
    { label: 'Profile', description: 'Your name, email, and account details.' },
    { label: 'Requests', description: 'Every service request and diagnosis you have submitted.' },
    { label: 'Saved contractors', description: 'Contractors you have favourited.' },
    { label: 'Addresses', description: 'Saved addresses on your account.' },
    { label: 'Contact history', description: 'A record of contractors you have contacted.' },
];

export default function DataExportClient() {
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
                                            Data Export
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to request a copy of your data.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/data-export">
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
                                        Data Export
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Download a copy of everything we hold about you. Your export will include the following.
                                    </p>
                                </div>

                                <div className="flex flex-col">
                                    {EXPORT_ITEMS.map((item, index) => (
                                        <div key={item.label}>
                                            {index > 0 && <Separator />}
                                            <div className="flex flex-col gap-0.5 py-3">
                                                <p className="text-sm font-medium">{item.label}</p>
                                                <p className="text-xs text-muted-foreground">{item.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button asChild variant="secondary">
                                    <Link href="/settings/support">Request Export</Link>
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
