'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/auth-context';

/**
 * UserAvatar — compact avatar for the top-bar rightSlot.
 *
 * Reads the current auth user and renders:
 *   - AvatarImage  if `user_metadata.avatar_url` is present
 *   - AvatarFallback with two-letter initials (first_name + surname)
 *     or the first letter of the email address as a last resort
 *
 * Returns null when no user is signed in so callers never need to guard.
 */
export function UserAvatar() {
    const { user } = useAuth();
    if (!user) return null;

    const firstName = (user.user_metadata?.first_name ?? '') as string;
    const surname   = (user.user_metadata?.surname    ?? '') as string;
    const avatarUrl = (user.user_metadata?.avatar_url ?? '') as string;
    const email     = user.email ?? '';

    let initials = '';
    if (firstName && surname) {
        initials = `${firstName[0]}${surname[0]}`.toUpperCase();
    } else if (firstName) {
        initials = firstName[0].toUpperCase();
    } else if (email) {
        initials = email[0].toUpperCase();
    }

    return (
        <Avatar>
            {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={firstName || email} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
    );
}
