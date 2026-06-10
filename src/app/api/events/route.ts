// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { createHash } from 'crypto';
import { analyticsSessionId } from '@/lib/analytics/session';

const VALID_EVENTS = [
    'welcome_start',
    'diagnosis_complete',
    'match_view',
    'provider_contact',
    'provider_profile_view',
] as const;
type EventType = (typeof VALID_EVENTS)[number];

function hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function getIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'analyticsEvents');
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true }); // fail silently

    const event_type = typeof body.event_type === 'string' ? body.event_type : '';
    if (!VALID_EVENTS.includes(event_type as EventType)) {
        return NextResponse.json({ ok: true }); // fail silently for unknown events
    }

    // Server-derived, not client-supplied, so distinct-session metrics can't be
    // inflated (finding L3).
    const session_id = analyticsSessionId(req);

    const provider_id = typeof body.provider_id === 'string' ? body.provider_id.slice(0, 128) : null;
    const diagnosis_id = typeof body.diagnosis_id === 'string' ? body.diagnosis_id.slice(0, 128) : null;
    const user_agent = req.headers.get('user-agent')?.slice(0, 512) ?? null;
    const ip_hash = hashIp(getIp(req));

    try {
        const admin = await createSupabaseAdminClient();
        await admin.from('diagnosis_events').insert({
            session_id,
            event_type,
            provider_id: provider_id || null,
            diagnosis_id: diagnosis_id || null,
            user_agent,
            ip_hash,
        });
    } catch {
        // Analytics must never error the caller.
    }

    return NextResponse.json({ ok: true });
}
