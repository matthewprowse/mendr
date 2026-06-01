/**
 * Lists profiles for the simulator's "Simulating as" dropdown.
 *
 * Returns a small set of profiles (id + display name + saved-location count) so
 * the simulator can drive the bot as a registered user. The bot identifies the
 * user by passing the profile id as the `from` field.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('profiles')
        .select('id, first_name, surname, username, locations')
        .limit(50);

    if (error) {
        console.error('[whatsapp/simulator/profiles] error:', error);
        return NextResponse.json({ error: 'Failed to load profiles.' }, { status: 500 });
    }

    const profiles = (data ?? []).map((p) => {
        const name =
            [p.first_name, p.surname].filter(Boolean).join(' ').trim() ||
            (typeof p.username === 'string' ? p.username : '') ||
            'Unnamed user';
        const locationCount = Array.isArray(p.locations) ? p.locations.length : 0;
        return { id: p.id as string, name, locationCount };
    });

    return NextResponse.json({ profiles });
}
