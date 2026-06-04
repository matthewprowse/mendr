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
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClick}
                disabled={!providerId || loading}
                aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
                aria-pressed={saved}
                className={cn(
                    'size-8',
                    saved ? 'text-rose-500 hover:text-rose-600' : 'text-muted-foreground hover:text-foreground',
                    className
                )}
            >
                {loading ? (
                    <Spinner className="size-4 text-muted-foreground" />
                ) : (
                    <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
                )}
            </Button>
            <HomeownerAuthDialog
                open={authDialogOpen}
                onOpenChange={setAuthDialogOpen}
                reason="Sign in to save contractors to your Favourites."
            />
        </>
    );
}
