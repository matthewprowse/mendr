'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FlowTopBar } from '@/components/match/flow-shell';
import { UserAvatar } from '@/components/user-avatar';
import { BRAND_NAME_PRO } from '@/lib/brand-system';
import { ProTabBar } from '@/components/pro-tab-bar';

/**
 * Mendr Pro portal chrome — matches the customer account pages: a FlowTopBar
 * with the brand centred and the avatar on the right, a centred max-w-xl scroll
 * area, and a sticky ProTabBar footer.
 */
export default function ProPortalLayout({ children }: { children: ReactNode }) {
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
                        {BRAND_NAME_PRO}
                    </p>
                }
                rightSlot={<UserAvatar />}
            />
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex flex-1 flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                {children}
                            </div>
                        </div>
                        <ProTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
