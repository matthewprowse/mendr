import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { applyRateLimit, type RateLimitConfig } from './rate-limit';

// ─────────────────────────────────────────────────────────────────────────────
// MASTER RATE LIMIT CONFIGURATION
//
// windowMs  — sliding window duration in milliseconds
// max       — maximum requests allowed per IP within that window
//
// Tuning guide:
//   - Raise `max` if legitimate users are getting throttled (check logs first)
//   - Lower `max` if you see quota spikes on Google/Gemini dashboards
//   - All values should be reviewed when the app moves from beta to GA
// ─────────────────────────────────────────────────────────────────────────────

export const RATE_LIMITS = {

    // ── AI endpoints ───────────────────────────────────────────────────────────
    // Gemini streaming call — most expensive operation in the app.
    // 10 per 10 minutes = ~1 per minute sustained; enough for real homeowners,
    // tight enough to blunt scripted abuse.
    diagnose: {
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 10,
    },

    // Diagnosis refinement — re-runs the two-agent pipeline with appended text
    // and/or additional photos. Cheaper per call than a fresh diagnosis (no quota
    // increment, smaller payloads on average) but still calls Gemini twice, so
    // keep a moderate-tight cap to prevent abuse.
    refineDiagnosis: {
        windowMs: 60 * 1000, // 1 minute
        max: 10,
    },

    // Gemini call to build a WhatsApp message summary. Lighter than diagnosis.
    whatsappMessage: {
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 20,
    },

    // ── Google API endpoints ───────────────────────────────────────────────────
    // Google Places Text Search. Each call may spawn pagination + per-provider
    // detail fetches. Keep tight — 1 search per 4 seconds sustained is plenty.
    providers: {
        windowMs: 60 * 1000, // 1 minute
        max: 15,
    },

    // Google Geocoding API. No cache on this route — every miss hits Google.
    geocode: {
        windowMs: 60 * 1000, // 1 minute
        max: 20,
    },

    // Onboarding: Places Text Search (contractor business lookup).
    onboardingSearch: {
        windowMs: 60 * 1000,
        max: 15,
    },

    // Onboarding: Place Details + cached reads (per selected business).
    onboardingPlaceDetails: {
        windowMs: 60 * 1000,
        max: 25,
    },

    // Provider application file uploads (registration cert, KYC, certifications).
    providerApplicationUpload: {
        windowMs: 60 * 60 * 1000,
        max: 40,
    },

    // Google Directions API. Has 7-day Supabase cache; most requests are free.
    directions: {
        windowMs: 60 * 1000, // 1 minute
        max: 40,
    },

    // Full enrichment pipeline: scrape + Gemini image classify + Gemini enrich.
    // Callers send a batch of place IDs — no need to call this frequently.
    enrichQueue: {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 5,
    },

    // Google gallery sync per provider. Calls Google Places API + downloads images.
    syncGallery: {
        windowMs: 60 * 1000, // 1 minute
        max: 10,
    },

    // ── Storage / upload endpoints ─────────────────────────────────────────────
    // Image upload. Legitimate use: 1 photo per diagnosis session.
    uploadImage: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20,
    },

    // Voice note transcription via Google Speech-to-Text.
    transcribe: {
        windowMs: 60 * 1000, // 1 minute
        max: 20,
    },

    // Onboarding step-1 description quality check (no external APIs).
    validateStartDescription: {
        windowMs: 60 * 1000,
        max: 40,
    },

    // ── Database read/write endpoints ──────────────────────────────────────────
    // Enrichment cache read. Pure Supabase read — generous limit.
    enrichGet: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Review submission. Spam risk even with pending-approval gate.
    reviews: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
    },

    // ── Public abuse surfaces (previously unprotected) ─────────────────────────
    // Analytics event writes — cheap DB insert but publicly callable.
    // 60 per minute gives generous headroom for real sessions.
    analyticsEvents: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Provider application submit — triggers onboarding pipeline.
    // 3 per hour: a legitimate applicant needs one, possibly a retry.
    providerApply: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
    },

    // HEIC image conversion — CPU + storage work per request.
    // 20 per hour covers a normal multi-photo diagnosis session.
    heicConvert: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20,
    },

    // Contact form submissions — email trigger, spam risk.
    // Dedicated bucket replaces the misused 'reviews' bucket.
    contactForm: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
    },

    // Contractor waitlist sign-ups — email trigger, spam risk.
    // Dedicated bucket replaces the misused 'reviews' bucket.
    contractorWaitlist: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
    },

    // Review count read. Two count queries — very low cost.
    reviewsCount: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Public service catalogue read — backed by Redis + DB cache, very cheap.
    serviceCatalog: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Public marketing stats — response is cached for 5 minutes at the CDN layer.
    // Light DB read; rate limit is a backstop against cache stampedes.
    marketingStats: {
        windowMs: 60 * 1000, // 1 minute
        max: 20,
    },

    // Report info read — returns non-sensitive summary fields for WhatsApp prefill.
    reportInfo: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // Provider profile text normalisation — unauthenticated POST that mutates providers.
    // Tight limit: legitimate callers (enrichment pipeline) need at most a handful per run.
    providerCleanProfile: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20,
    },

    // Token restoration. Has internal 45-second dedup; this is the outer bound.
    restoreToken: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 30,
    },

    // Guest location upsert for match flow — server uses admin client to bypass RLS.
    conversationLocation: {
        windowMs: 60 * 1000,
        max: 40,
    },

    // Conversation row read (diagnosis bootstrap, match trade) — service role.
    conversationRead: {
        windowMs: 60 * 1000,
        max: 80,
    },

    // Conversation diagnosis / metadata writes — service role.
    conversationUpsert: {
        windowMs: 60 * 1000,
        max: 60,
    },

    // Public applicant edit page — token validation + save. Tight to prevent
    // token enumeration. Legitimate applicants need at most a handful of calls.
    applicationEdit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20,
    },

    // Contractor reapply after rejection — creates a new application row.
    // Very low limit: a legitimate contractor reapplies at most once or twice.
    contractorReapply: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
    },

    // Homeowner account location management — read, add, delete saved addresses.
    accountLocations: {
        windowMs: 60 * 1000, // 1 minute
        max: 40,
    },

    // Homeowner password change. Sensitive — tight cap to slow brute attempts.
    accountPassword: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
    },

    // Homeowner account deletion. Destructive and one-way; very tight cap.
    accountDelete: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
    },

    // Homeowner contacts a contractor from a match/report page.
    contactContractor: {
        windowMs: 60 * 1000, // 1 minute
        max: 20,
    },

    // Direct match: homeowner skips AI diagnosis and goes straight to /match.
    // DB write only — no AI or external API calls. 10 per hour is generous.
    directMatch: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10,
    },

    // Homeowner saves/unsaves a contractor profile.
    savedProviders: {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
    },

    // One-click job outcome rating from email link.
    // Very generous — each homeowner gets one email per contact event.
    jobOutcome: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20,
    },

} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

function parseCsvEnv(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
}

/**
 * Temporary local/dev bypass:
 * - DISABLE_RATE_LIMIT=true (global bypass)
 * - RATE_LIMIT_BYPASS_IPS=127.0.0.1,::1 (IP-specific bypass)
 */
export function isRateLimitBypassed(req: NextRequest): boolean {
    const disableAll = process.env.DISABLE_RATE_LIMIT === 'true';
    if (disableAll) return true;

    const callerIp = getCallerIp(req);
    if (!callerIp) return false;

    const bypassIps = new Set(parseCsvEnv(process.env.RATE_LIMIT_BYPASS_IPS));
    return bypassIps.has(callerIp);
}

// ─────────────────────────────────────────────────────────────────────────────
// IP extraction
//
// On Vercel, the real client IP is set by the edge network in x-forwarded-for.
// In local dev this is often undefined — rate limiting degrades gracefully
// (all unknown-IP requests share the 'unknown' bucket, fine for dev).
// ─────────────────────────────────────────────────────────────────────────────

export function getCallerIp(req: NextRequest): string | null {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: apply a named rate limit and return a ready-made 429 response if the
// caller is over the limit, or null if the request is allowed through.
//
// Usage in any route handler:
//   const limited = checkRateLimit(req, 'diagnose');
//   if (limited) return limited;
// ─────────────────────────────────────────────────────────────────────────────

export async function checkRateLimit(
    req: NextRequest,
    bucket: RateLimitBucket,
): Promise<NextResponse | null> {
    if (isRateLimitBypassed(req)) return null;

    const config = RATE_LIMITS[bucket];
    const result = await applyRateLimit({ ip: getCallerIp(req), bucket, config });

    if (!result.ok) {
        const retryAfterSecs = Math.ceil((result.resetAt - Date.now()) / 1000);
        const waitMinutes = Math.max(1, Math.ceil(retryAfterSecs / 60));
        const waitLabel = waitMinutes === 1 ? 'minute' : 'minutes';
        return NextResponse.json(
            {
                error: 'rate_limited',
                message: `You have hit a temporary request limit. Please wait about ${waitMinutes} ${waitLabel}, then try again.`,
                limit: config.max,
                retryAfterSeconds: retryAfterSecs,
            },
            {
                status: 429,
                headers: {
                    'Retry-After':          String(retryAfterSecs),
                    'X-RateLimit-Limit':    String(config.max),
                    'X-RateLimit-Remaining':'0',
                    'X-RateLimit-Reset':    String(Math.ceil(result.resetAt / 1000)),
                },
            },
        );
    }

    return null;
}
