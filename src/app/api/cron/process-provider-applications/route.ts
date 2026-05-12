/**
 * Cron: process-provider-applications
 *
 * Runs every 5 minutes. Claims queued provider_applications rows, runs fuzzy
 * name + geo matching against the providers table, generates a Gemini profile
 * summary, and persists results.
 *
 * Schedule: defined in vercel.json
 * Auth: CRON_SECRET via isAuthorizedCronRequest
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { getGeminiModel } from '@/lib/ai-client';
import { normalizeProviderName } from '@/app/api/providers/provider-display-name';

export const maxDuration = 60; // seconds — Vercel Hobby allows up to 60s

const BATCH_SIZE      = 5;   // rows to process per invocation
const MIN_MATCH_SCORE = 0.3; // pg_trgm similarity threshold
const MAX_GEO_KM      = 30;  // km radius for geo tie-breaker
const TOKEN_TTL_DAYS  = 14;

// ─── Types ────────────────────────────────────────────────────────────────────

type QueuedApplication = {
    id: string;
    business_name: string | null;
    contact_name: string;
    email: string;
    address: string;
    trade: string;
    trade_description: string | null;
    service_areas: Array<{
        address?: string;
        lat?: number | null;
        lng?: number | null;
        radius_km?: number | null;
    }> | null;
};

type ProviderMatch = {
    id: string;
    name: string;
    address: string | null;
    google_place_id: string | null;
    similarity: number;
    distance_km: number | null;
};

type EnrichmentPayload = {
    provider: {
        id: string;
        name: string;
        address: string | null;
        rating: number | null;
        rating_count: number | null;
        phone: string | null;
        website: string | null;
        specialisations: string[] | null;
        highlights: string[] | null;
        summary: string | null;
        summary_long: string | null;
        about: string | null;
        past_work: string | null;
    };
    cache: {
        bio: string | null;
        specialisations: string[] | null;
        review_summary: string | null;
        services: string[] | null;
    } | null;
    topReviews: Array<{ text: string; rating: number }>;
};

// ─── Main handler ─────────────────────────────────────────────────────────────

/** Same auth and behavior as GET — supports fire-and-forget POST from `providers/apply`. */
export async function POST(req: NextRequest) {
    return GET(req);
}

export async function GET(req: NextRequest) {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    // Claim BATCH_SIZE queued rows atomically — set status = 'running' to prevent
    // double processing on overlapping cron runs.
    const { data: claimed, error: claimError } = await admin
        .from('provider_applications')
        .update({
            enrichment_status:     'running',
            enrichment_started_at: new Date().toISOString(),
            enrichment_error:      null,
        })
        .eq('enrichment_status', 'queued')
        .order('enrichment_queued_at', { ascending: true })
        .limit(BATCH_SIZE)
        .select('id, business_name, contact_name, email, address, trade, trade_description, service_areas');

    if (claimError) {
        console.error('[process-applications] claim error:', claimError);
        return NextResponse.json({ error: 'Failed to claim rows' }, { status: 500 });
    }

    if (!claimed || claimed.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, message: 'No queued applications' });
    }

    const applications = claimed as QueuedApplication[];
    const results: Array<{ id: string; outcome: string }> = [];

    for (const app of applications) {
        try {
            const outcome = await processApplication(admin, app);
            results.push({ id: app.id, outcome });
        } catch (err) {
            console.error(`[process-applications] fatal error for ${app.id}:`, err);
            await admin
                .from('provider_applications')
                .update({
                    enrichment_status: 'failed',
                    enrichment_error:  err instanceof Error ? err.message : String(err),
                })
                .eq('id', app.id);
            results.push({ id: app.id, outcome: 'failed' });
        }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
}

// ─── Per-application processor ────────────────────────────────────────────────

async function processApplication(
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
    app: QueuedApplication,
): Promise<string> {
    const nameToMatch = normalizeProviderName(app.business_name || app.contact_name);

    // ── 1. Fuzzy name match via pg_trgm ──────────────────────────────────────
    // Extract location hint from service_areas[0]
    const firstArea = app.service_areas?.[0];
    const hasGeo    = typeof firstArea?.lat === 'number' && typeof firstArea?.lng === 'number';
    const lat       = hasGeo ? firstArea!.lat! : null;
    const lng       = hasGeo ? firstArea!.lng! : null;

    // We run raw SQL because PostgREST doesn't expose pg_trgm operators directly.
    // Supabase's .rpc() can call a DB function — we use a simple inline approach
    // via the textSearch + similarity workaround, or we write a helper fn.
    // Since we can't guarantee a DB function exists, we fetch candidates and
    // score client-side (still fast for O(1000) providers).
    const { data: candidates, error: matchError } = await admin
        .from('providers')
        .select('id, name, address, google_place_id, lat, lng')
        .limit(1000);

    if (matchError) throw new Error(`Provider fetch error: ${matchError.message}`);
    if (!candidates || candidates.length === 0) {
        await markNoMatch(admin, app.id, 'No providers in database');
        return 'no_match';
    }

    // Client-side trigram similarity approximation using Dice coefficient
    function trigramSimilarity(a: string, b: string): number {
        const trigrams = (s: string) => {
            const padded = `  ${s.toLowerCase()}  `;
            const set = new Set<string>();
            for (let i = 0; i < padded.length - 2; i++) {
                set.add(padded.slice(i, i + 3));
            }
            return set;
        };
        const ta = trigrams(a);
        const tb = trigrams(b);
        if (ta.size === 0 || tb.size === 0) return 0;
        let shared = 0;
        for (const t of ta) { if (tb.has(t)) shared++; }
        return (2 * shared) / (ta.size + tb.size);
    }

    function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const scored: ProviderMatch[] = candidates.map((c: any) => {
        const nameSim = trigramSimilarity(nameToMatch, normalizeProviderName(c.name || ''));
        const distKm =
            hasGeo && typeof c.lat === 'number' && typeof c.lng === 'number'
                ? haversineKm(lat!, lng!, c.lat, c.lng)
                : null;
        // Combined score: name similarity weighted 70%, geo score (within range) 30%
        const geoScore =
            distKm === null ? 0 : distKm <= MAX_GEO_KM ? (1 - distKm / MAX_GEO_KM) * 0.3 : 0;
        const combined = nameSim * 0.7 + geoScore;
        return { id: c.id, name: c.name, address: c.address, google_place_id: c.google_place_id, similarity: combined, distance_km: distKm };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const best = scored[0];

    const nameSimilarityOnly = trigramSimilarity(nameToMatch, normalizeProviderName(best?.name || ''));
    if (!best || nameSimilarityOnly < MIN_MATCH_SCORE) {
        await markNoMatch(admin, app.id, `Best similarity ${nameSimilarityOnly.toFixed(3)} below threshold ${MIN_MATCH_SCORE}`);
        return 'no_match';
    }

    // ── 2. Hydrate enrichment payload ─────────────────────────────────────────
    const [providerResult, cacheResult, reviewsResult] = await Promise.all([
        admin.from('providers').select('*').eq('id', best.id).single(),
        admin.from('provider_cache').select('bio, specialisations, review_summary, services').eq('provider_id', best.id).maybeSingle(),
        admin.from('reviews').select('text, rating').eq('provider_id', best.id).order('rating', { ascending: false }).limit(5),
    ]);

    const provider = providerResult.data;
    const cache    = cacheResult.data ?? null;
    const reviews  = (reviewsResult.data ?? []) as Array<{ text: string; rating: number }>;

    const payload: EnrichmentPayload = {
        provider: {
            id:              provider?.id,
            name:            provider?.name,
            address:         provider?.address ?? null,
            rating:          provider?.rating ?? null,
            rating_count:    provider?.rating_count ?? null,
            phone:           provider?.phone ?? null,
            website:         provider?.website ?? null,
            specialisations: provider?.specialisations ?? null,
            highlights:      provider?.highlights ?? null,
            summary:         provider?.summary ?? null,
            summary_long:    provider?.summary_long ?? null,
            about:           provider?.about ?? null,
            past_work:       provider?.past_work ?? null,
        },
        cache,
        topReviews: reviews.filter((r) => r.text),
    };

    // ── 3. Generate Gemini summary ────────────────────────────────────────────
    const geminiSummary = await generateGeminiSummary(app, payload);

    // ── 4. Persist results ────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { error: saveError } = await admin
        .from('provider_applications')
        .update({
            enrichment_status:       'complete',
            enrichment_completed_at: now,
            enrichment_error:        null,
            matched_provider_id:     best.id,
            matched_google_place_id: best.google_place_id ?? null,
            match_score:             best.similarity,
            enrichment_input:        { name_to_match: nameToMatch, lat, lng },
            enrichment_payload:      payload,
            gemini_summary:          geminiSummary,
            gemini_model:            'gemini-2.5-flash',
            gemini_generated_at:     now,
        })
        .eq('id', app.id);

    if (saveError) throw new Error(`Save error: ${saveError.message}`);
    return 'complete';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function markNoMatch(
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
    id: string,
    reason: string,
): Promise<void> {
    await admin
        .from('provider_applications')
        .update({
            enrichment_status:       'no_match',
            enrichment_completed_at: new Date().toISOString(),
            enrichment_error:        reason,
            matched_provider_id:     null,
            match_score:             null,
        })
        .eq('id', id);
}

async function generateGeminiSummary(
    app: QueuedApplication,
    payload: EnrichmentPayload,
): Promise<string> {
    const model = getGeminiModel();

    const providerSection = [
        payload.provider.name && `Business: ${payload.provider.name}`,
        payload.provider.address && `Location: ${payload.provider.address}`,
        payload.provider.rating && `Rating: ${payload.provider.rating} (${payload.provider.rating_count} reviews)`,
        payload.provider.specialisations?.length && `Specialisations: ${payload.provider.specialisations.join(', ')}`,
        payload.provider.highlights?.length && `Highlights: ${payload.provider.highlights.join(', ')}`,
        payload.provider.summary_long && `About (from Google): ${payload.provider.summary_long.slice(0, 400)}`,
        payload.provider.about && `Additional context: ${payload.provider.about.slice(0, 300)}`,
        payload.cache?.bio && `Bio: ${payload.cache.bio.slice(0, 400)}`,
        payload.cache?.review_summary && `Customer review themes: ${payload.cache.review_summary.slice(0, 300)}`,
        payload.cache?.services?.length && `Services listed: ${payload.cache.services.join(', ')}`,
    ].filter(Boolean).join('\n');

    const reviewSection = payload.topReviews.length > 0
        ? `Top customer reviews:\n${payload.topReviews.map((r) => `- (${r.rating}★) ${r.text.slice(0, 200)}`).join('\n')}`
        : '';

    const applicationSection = [
        `Trade: ${app.trade}`,
        app.trade_description && `Specialisation (self-described): ${app.trade_description.slice(0, 300)}`,
    ].filter(Boolean).join('\n');

    const prompt = `You are writing a short, honest public profile summary for a home services contractor in Cape Town, South Africa.

CONTEXT ABOUT THE CONTRACTOR
${providerSection}

APPLICATION DETAILS
${applicationSection}

${reviewSection}

Write a concise public profile summary in 2–3 short paragraphs. Guidelines:
- Direct, warm, and factual — no marketing fluff or hype.
- Describe what they do and who they are, not just that they are "great" or "excellent".
- If rating and review data is available, weave in what customers say — without quoting verbatim.
- End with a practical statement about coverage area or availability if the data supports it.
- Plain text only — no headings, no bullet points, no markdown.
- Maximum 200 words.`;

    try {
        const result = await model.generateContent(prompt);
        const text   = result.response.text().trim();
        return text || 'Profile summary could not be generated.';
    } catch (err) {
        console.error('[process-applications] Gemini error:', err);
        return 'Profile summary could not be generated.';
    }
}

// ─── Token generation utility (route-local; Next.js route modules may only export route handlers + config) ─

function generateSecureToken(): { raw: string; hash: string } {
    const raw  = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
}

function tokenExpiresAt(days = TOKEN_TTL_DAYS): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}
