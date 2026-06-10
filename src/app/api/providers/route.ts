// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * Match provider list. The heavy lifting lives in `@/lib/providers/handler`;
 * this route wraps it to gate specialist identity (Phase 2 of the onboarding
 * plan).
 *
 * A homeowner sees the full identity (name, phone, website, address, photos)
 * only when signed in with a captured mobile number. Otherwise the identity is
 * stripped from the response server-side, so it cannot be read from the network
 * tab, and each card carries `identityLocked: true`. Ratings, review summaries,
 * suburb, distance, and capability fields are always shown so the list is still
 * a useful teaser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST as handlerPOST } from '@/lib/providers/handler';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

type Loose = Record<string, unknown>;

function suburbOf(address: unknown): string {
    if (typeof address !== 'string' || !address.trim()) return '';
    const parts = address
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
}

/** Strip everything that identifies the business; keep ratings/summary/suburb. */
function lockIdentity(provider: Loose): Loose {
    return {
        ...provider,
        name: 'Verified Specialist',
        phone: null,
        website: null,
        address: suburbOf(provider.address),
        bio: null,
        images: [],
        hasWorkPhotos: false,
        identityLocked: true,
    };
}

async function isAuthorised(): Promise<boolean> {
    try {
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;
        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('profiles')
            .select('phone')
            .or(`id.eq.${user.id},user_id.eq.${user.id}`)
            .maybeSingle();
        const phone = (data as { phone?: string | null } | null)?.phone;
        return typeof phone === 'string' && phone.trim().length > 0;
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    // Auth check reads cookies only, so the request body is left intact for the
    // handler below.
    const authorised = await isAuthorised();

    const res = await handlerPOST(req);
    if (authorised || res.status !== 200) return res;

    let body: Loose;
    try {
        body = (await res.json()) as Loose;
    } catch {
        // Non-JSON or already consumed — return the original response untouched.
        return res;
    }

    if (Array.isArray(body.providers)) {
        body.providers = (body.providers as Loose[]).map(lockIdentity);
    }

    return NextResponse.json(body, { status: 200 });
}
