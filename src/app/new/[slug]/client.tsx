'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { UserAvatar } from '@/components/user-avatar';
import { Markdown } from '@/components/markdown';
import { formatLongDate } from '@/lib/format-date';
import type { Announcement } from '@/features/home/announcements';

export default function AnnouncementClient({ announcement }: { announcement: Announcement }) {
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
                            <article className="mx-auto flex w-full max-w-xl flex-col gap-6">
                                <header className="flex flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {formatLongDate(announcement.published_at)}
                                    </p>
                                    <h1 className="text-2xl font-semibold text-foreground">{announcement.title}</h1>
                                    {announcement.summary ? (
                                        <p className="text-sm text-muted-foreground">{announcement.summary}</p>
                                    ) : null}
                                </header>

                                {announcement.image_url ? (
                                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border">
                                        <Image
                                            src={announcement.image_url}
                                            alt={announcement.title}
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 576px) 100vw, 576px"
                                        />
                                    </div>
                                ) : null}

                                {announcement.body ? <Markdown>{announcement.body}</Markdown> : null}
                            </article>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
