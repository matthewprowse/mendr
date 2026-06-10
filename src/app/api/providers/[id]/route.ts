// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * GET /api/providers/[id]
 *
 * Single typed contractor profile for `/pro/[id]`.
 *
 * - Accepts an internal `providers.id` UUID OR a Google Place ID
 *   (`places/...` or the raw place ID; the route normalises both).
 * - Joins `provider_certifications` (slug → label/issuer) and the first 12
 *   approved `provider_images` rows.
 * - Sanitises `summary`, `summary_long`, `about`, `past_work`, `bio` through
 *   `sanitizeProfileText` and runs the LLM content guard on every prose field
 *   so legacy rows with HTML/CSS leakage never reach the page.
 * - On any leak, fires a fire-and-forget `POST /api/enrich/queue` with
 *   `mode: 'full'` and `reason: 'leak_detected'` so the row gets re-enriched
 *   in the background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { loadContractorProfileById } from '@/lib/providers/contractor-profile-server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'providers');
    if (limited) return limited;

    try {
        const { id: rawId } = await params;
        const id = decodeURIComponent(rawId ?? '').trim();

        const result = await loadContractorProfileById(id);

        switch (result.status) {
            case 'bad_request':
                return NextResponse.json({ error: 'id is required' }, { status: 400 });
            case 'not_found':
                return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
            case 'error':
                return NextResponse.json({ error: result.message }, { status: 500 });
            case 'ok':
                return NextResponse.json({ provider: result.profile, leakDetected: result.leakDetected });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
