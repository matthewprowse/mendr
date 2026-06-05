'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/context/auth-context';

/**
 * UserAvatar — compact avatar for the top-bar rightSlot.
 *
 * Reads the current auth user and renders:
 *   - AvatarImage  if `user_metadata.avatar_url` is present (set by Google OAuth
 *     and our upload flow, and cleared on remove so it reverts to initials)
 *   - AvatarFallback with two-letter initials (first_name + surname, or the
 *     Google `name`/`full_name`) or the first letter of the email as a last resort
 *
 * Returns null when no user is signed in so callers never need to guard.
 */
export function UserAvatar() {
    const { user } = useAuth();
    if (!user) return null;

    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const firstName = meta.first_name ?? meta.given_name ?? '';
    const surname = meta.surname ?? meta.family_name ?? '';
    const fullName = meta.name ?? meta.full_name ?? '';
    const avatarUrl = meta.avatar_url || '';
    const email = user.email ?? '';

    let initials = '';
    if (firstName && surname) {
        initials = `${firstName[0]}${surname[0]}`.toUpperCase();
    } else if (fullName.trim()) {
        const parts = fullName.trim().split(/\s+/);
        initials = (
            parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]
        ).toUpperCase();
    } else if (firstName) {
        initials = firstName[0].toUpperCase();
    } else if (email) {
        initials = email[0].toUpperCase();
    }

    return (
        <Avatar>
            {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={firstName || fullName || email} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
    );
}
