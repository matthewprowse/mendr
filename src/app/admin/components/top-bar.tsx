'use client';

/**
 * AdminTopBar — sticky top header mirroring the customer home top bar: full-width
 * sticky bar with the brand centred and an action on the right (sign-out, the
 * admin equivalent of the customer avatar). Inner content is constrained to
 * max-w-xl to line up with the page content and the footer.
 */

import { BRAND_NAME } from '@/lib/brand-system';
import { SignOutButton } from './sign-out-button';

export function AdminTopBar() {
    return (
        <div className="sticky top-0 z-20 shrink-0 bg-background py-3">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 sm:px-6 lg:px-8">
                <div className="flex-1" />
                <span className="text-base font-medium text-foreground">{BRAND_NAME}</span>
                <div className="flex flex-1 justify-end">
                    <SignOutButton />
                </div>
            </div>
        </div>
    );
}
