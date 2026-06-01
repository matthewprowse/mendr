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
