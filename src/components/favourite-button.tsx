'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, HeartFill } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { AuthPromptDialog } from '@/components/auth-prompt-dialog';
import { useAuth } from '@/context/auth-context';

interface FavouriteButtonProps {
    /** Google Places place_id for a cached provider */
    placeId?: string | null;
    /** Slug for a registered provider_profile */
    providerProfileSlug?: string | null;
    /** Display name used in the confirmation tooltip and snapshot */
    providerName: string;
    /** Size variant — 'icon' renders only the heart; 'default' includes label text */
    variant?: 'icon' | 'default';
    className?: string;
}

/**
 * Heart button that saves/removes a provider from the logged-in user's favourites.
 * If not logged in, shows an AuthPromptDialog.
 */
export function FavouriteButton({
    placeId,
    providerProfileSlug,
    providerName,
    variant = 'icon',
    className,
}: FavouriteButtonProps) {
    const { user, isLoading: authLoading } = useAuth();

    const [isFavourited, setIsFavourited] = useState(false);
    const [loading, setLoading] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);

    // Fetch current favourite state when user is present
    const fetchState = useCallback(async () => {
        if (!user || (!placeId && !providerProfileSlug)) return;
        try {
            const params = new URLSearchParams();
            if (placeId) params.set('place_id', placeId);
            if (providerProfileSlug) params.set('slug', providerProfileSlug);
            const res = await fetch(`/api/favourites?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setIsFavourited(!!data.favourited);
            }
        } catch (_) {}
    }, [user, placeId, providerProfileSlug]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    const handleToggle = async () => {
        if (!user) {
            setAuthOpen(true);
            return;
        }
        if (loading) return;
        setLoading(true);
        const next = !isFavourited;
        // Optimistic update
        setIsFavourited(next);
        try {
            await fetch('/api/favourites', {
                method: next ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    place_id: placeId ?? null,
                    provider_profile_slug: providerProfileSlug ?? null,
                    provider_name: providerName,
                }),
            });
        } catch (_) {
            // Revert on error
            setIsFavourited(!next);
        } finally {
            setLoading(false);
        }
    };

    const label = isFavourited ? 'Saved' : 'Save';

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size={variant === 'icon' ? 'icon' : 'default'}
                className={`shrink-0 ${isFavourited ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'} ${className ?? ''}`}
                onClick={handleToggle}
                disabled={loading || authLoading}
                title={label}
                aria-label={label}
                aria-pressed={isFavourited}
            >
                {isFavourited ? (
                    <HeartFill className="size-4" />
                ) : (
                    <Heart className="size-4" />
                )}
                {variant === 'default' && <span className="ml-1.5">{label}</span>}
            </Button>

            <AuthPromptDialog
                open={authOpen}
                onOpenChange={setAuthOpen}
                reason={`Sign in to save ${providerName} to your favourites.`}
            />
        </>
    );
}
