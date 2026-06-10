'use client';

import { Children } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { UserAvatar } from '@/components/user-avatar';
import type { Announcement } from '@/features/home/announcements';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.';

function RowList({ children }: { children: React.ReactNode }) {
    const rows = Children.toArray(children);
    return (
        <div className="flex flex-col">
            {rows.map((row, i) => (
                <div key={i}>
                    {i > 0 && <Separator />}
                    {row}
                </div>
            ))}
        </div>
    );
}

export default function WhatsNewClient({ announcements }: { announcements: Announcement[] }) {
    const router = useRouter();

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
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

            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">What&apos;s New</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {announcements.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Nothing new just yet. Check back soon.</p>
                                ) : (
                                    <RowList>
                                        {announcements.map((a) => (
                                            <div
                                                key={a.slug}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => router.push(`/new/${a.slug}`)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        router.push(`/new/${a.slug}`);
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
                                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                    <p className="line-clamp-1 text-sm font-medium">{a.title}</p>
                                                    <p className="line-clamp-1 text-xs text-muted-foreground">{LOREM}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </RowList>
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
