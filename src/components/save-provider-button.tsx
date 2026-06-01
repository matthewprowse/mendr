'use client';

/**
 * SaveProviderButton — reusable heart toggle used on the match card and the
 * contractor profile.
 *
 * Behaviour:
 * - Logged-in user: toggles the row in public.saved_providers via
 *   /api/account/saved-providers (admin-client wrapper).
 * - Logged-out user: opens HomeownerAuthDialog instead of toggling.
 * - Optimistic UI: heart fills/un-fills immediately, reverts on API failure.
 * - stopPropagation on click so the parent card-tap doesn't fire.
 *
 * The hook itself (useSavedProvider) lives at
 * src/app/contractors/hooks/use-saved-provider.ts and was already wired before
 * this work; we just expose it via this button surface.
 */

import { useCallback, useState } from 'react';
import { Heart } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useSavedProvider } from '@/app/contractors/hooks/use-saved-provider';
import { HomeownerAuthDialog } from '@/components/homeowner-auth-dialog';
import { cn } from '@/lib/utils';

type SaveProviderButtonProps = {
    providerId: string | null;
    /** Extra classes for positioning (e.g. absolute top-right). */
    className?: string;
    /** Optional callback fired after a successful toggle (e.g. to track an event). */
    onToggled?: (saved: boolean) => void;
};

export function SaveProviderButton({
    providerId,
    className,
    onToggled,
}: SaveProviderButtonProps) {
    const { user } = useAuth();
    const isAuthenticated = Boolean(user && user.email);
    const { saved, loading, toggle } = useSavedProvider(providerId, isAuthenticated);
    const [authDialogOpen, setAuthDialogOpen] = useState(false);

    const handleClick = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!providerId) return;
            if (!isAuthenticated) {
                setAuthDialogOpen(true);
                return;
            }
            const next = await toggle();
            if (next != null) onToggled?.(next);
        },
        [providerId, isAuthenticated, toggle, onToggled]
    );

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={!providerId || loading}
                aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
                aria-pressed={saved}
                className={cn(
                    'inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60',
                    className
                )}
            >
                <Heart
                    size={16}
                    fill={saved ? 'currentColor' : 'none'}
                    className={saved ? 'text-foreground' : 'text-foreground'}
                />
            </button>
            <HomeownerAuthDialog
                open={authDialogOpen}
                onOpenChange={setAuthDialogOpen}
                reason="Sign in to save contractors to your Favourites."
            />
        </>
    );
}
