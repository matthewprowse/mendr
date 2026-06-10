/* eslint-disable no-console */
/**
 * Profile helpers for the WhatsApp bot.
 *
 * Reads saved locations off the `profiles.locations` JSONB array via the admin
 * client. The bot treats a non-null `user_id` on the session as "registered";
 * unregistered numbers are gated to /register before any diagnosis runs.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export interface SavedLocation {
    id: string;
    label: string;
    address: string;
    lat: number | null;
    lng: number | null;
}

/** Fetch a user's saved locations (max 10). Returns [] when none / on error. */
export async function getSavedLocations(
    userId: string,
): Promise<SavedLocation[]> {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('profiles')
        .select('locations')
        .eq('id', userId)
        .maybeSingle();
    if (error) {
        console.error('[whatsapp/profile] getSavedLocations error:', error);
        return [];
    }
    const raw = Array.isArray(data?.locations) ? data.locations : [];
    return raw
        .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
        .map((l) => ({
            id: typeof l.id === 'string' ? l.id : '',
            label: typeof l.label === 'string' ? l.label : '',
            address: typeof l.address === 'string' ? l.address : '',
            lat: typeof l.lat === 'number' ? l.lat : null,
            lng: typeof l.lng === 'number' ? l.lng : null,
        }))
        .filter((l) => l.id && l.address);
}

/**
 * Append a geocoded location to the user's saved profile locations (max 10), so
 * an address typed in WhatsApp persists and is offered next time. Best-effort:
 * never throws. Skips duplicates that resolve to the same rounded coordinates.
 */
export async function saveLocationForUser(
    userId: string,
    loc: { label?: string; address: string; lat: number; lng: number },
): Promise<void> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('profiles')
            .select('locations')
            .eq('id', userId)
            .maybeSingle();
        const existing = Array.isArray(data?.locations) ? data.locations : [];
        const round = (n: number) => Math.round(n * 1000) / 1000;
        const isDuplicate = existing.some(
            (l) =>
                typeof l === 'object' &&
                l !== null &&
                typeof (l as { lat?: unknown }).lat === 'number' &&
                typeof (l as { lng?: unknown }).lng === 'number' &&
                round((l as { lat: number }).lat) === round(loc.lat) &&
                round((l as { lng: number }).lng) === round(loc.lng),
        );
        if (isDuplicate) return;
        const entry = {
            id: crypto.randomUUID(),
            label: (loc.label ?? '').trim() || 'Saved address',
            address: loc.address,
            lat: loc.lat,
            lng: loc.lng,
        };
        const next = [...existing, entry].slice(0, 10);
        await admin.from('profiles').update({ locations: next }).eq('id', userId);
    } catch (e) {
        console.error('[whatsapp/profile] saveLocationForUser error:', e);
    }
}
