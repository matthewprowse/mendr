/* eslint-disable no-console */
/**
 * Background enrichment pipeline for provider profiles.
 *
 * Stages:
 *   1. Website scraping      – 10 s timeout, need ≥ 100 chars of content
 *   2. Reviews fetch         – load up to 40 approved reviews from Supabase
 *                             (started in parallel with Stage 1)
 *   3. Combined AI call      – ONE Gemini call for bio, specialisations, review summary,
 *                              narrative (replaces separate about/past_work), highlights
 *   4. Cache write           – upserts provider_cache row (14-day TTL)
 *   4b. Structured attributes – heuristic-only: company_size, years, certifications
 *                               (no Gemini call)
 *   5. Provider copy update  – writes narrative/summary_long/highlights to providers table
 *
 * Net Gemini calls per provider: 1 (reduced from up to 3).
 *
 * Match UI uses `enrichProviderReviewSummaryFast` — one small Gemini call from DB reviews only.
 * Fast path writes scrape_status='fast_only', never enriched_at, so it never blocks full enrichment.
 *
 * scrape_status values:
 *   'ok'               — full pipeline completed (website scraped + AI enrichment done)
 *   'fast_only'        — review summary only, no scrape; full enrichment still needed
 *   'fast_insufficient'— not enough reviews for fast summary
 *   'failed'           — scrape attempted but failed, or coordinates outside SA
 *   'skip'             — no website to scrape
 *   'pending'          — default, enrichment not yet attempted
 */

import { Type } from '@google/genai';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getGenAiClient, GEMINI_ENRICHMENT_MODEL_NAME } from '@/lib/ai/ai-client';
import { aiConfig } from '@/lib/ai/ai-config';
import { sanitizeCustomerSummary } from '@/lib/providers/review-summary';
import { formatBusinessName } from '@/lib/utils';
import {
    FAST_SUMMARY_MIN_CORPUS_CHARS,
    FAST_SUMMARY_MIN_REVIEWS,
    parseFastReviewSummaryModelJson,
} from '@/lib/providers/fast-review-summary';
import { validateLlmContentSafe } from '@/lib/ai/llm-content-guard';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** After a low-quality AI enrichment, allow retry sooner than full cache TTL. */
const LOW_QUALITY_RETRY_MS = 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS = 48 * 60 * 60 * 1000;
const SCRAPE_TIMEOUT_MS   = 10_000;
const AI_ENRICH_TIMEOUT   = 20_000;
/** Single-call review summary for match cards — must exceed cold Gemini latency. */
const FAST_REVIEW_SUMMARY_AI_MS = 15_000;
const MIN_SCRAPE_CHARS    = 100;

/** South Africa bounding box — providers outside this are marked failed. */
const SA_LAT_MIN = -35.0;
const SA_LAT_MAX = -22.0;
const SA_LNG_MIN = 16.0;
const SA_LNG_MAX = 33.0;

function serviceLabelsFromProvider(provider: {
    specialisations?: string[] | null;
}): string[] {
    const specs = provider.specialisations;
    if (Array.isArray(specs) && specs.length > 0) {
        return specs.map((s) => String(s).trim()).filter(Boolean);
    }
    return [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        ),
    ]);
}

function stripHtmlForEnrichment(html: string): string {
    const title =
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? '';
    const metaDesc =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
        '';
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
        .map((m) => m[1])
        .join('\n');

    const body = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/(p|div|br|li|h[1-6]|section|article|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');

    return [
        title ? `Title: ${title}` : '',
        metaDesc ? `Description: ${metaDesc}` : '',
        headings ? `Headings:\n${headings}` : '',
        jsonLd ? `Structured Data:\n${jsonLd}` : '',
        body,
    ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6_000);
}

function toTitleCase(value: string): string {
    const lower = value.toLowerCase();
    return lower.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function canonicalServiceKey(value: string): string {
    return value
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s]/g, ' ')
        // Strip generic suffixes that don't differentiate services
        .replace(/\bservices?\b/g, ' ')
        .replace(/\brepairs?\b/g, 'repair')
        .replace(/\binstallations?\b/g, 'installation')
        .replace(/\bmaintenances?\b/g, 'maintenance')
        .replace(/\bsolutions?\b/g, ' ')
        .replace(/\bsystems?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Synonym groups: terms that mean the same thing get mapped to the first entry (canonical).
 * Key = canonical display label (Title Case). Values = alternative phrasings to collapse into it.
 */
const SPECIALISATION_SYNONYMS: Record<string, string[]> = {
    'Drain Cleaning': ['drain unblocking', 'drain jetting', 'drain clearing', 'drain system cleaning', 'blocked drain'],
    'Leak Detection': ['leak finding', 'leak location', 'water leak detection'],
    'Leak Repair': ['leak fixing', 'pipe leak repair'],
    'Pipe Repair': ['pipe fixing', 'pipe replacement', 'piping repair'],
    'Geyser Repair': ['hot water heater repair', 'water heater repair', 'geyser fixing'],
    'Geyser Installation': ['hot water heater installation', 'water heater installation'],
    'Toilet Repair': ['toilet fixing', 'toilet unblocking', 'blocked toilet'],
    'Tap Repair': ['tap fixing', 'tap replacement', 'faucet repair'],
    'Electrical Installations': ['electrical installation', 'electrical fitting'],
    'Fault Finding': ['electrical fault finding', 'electrical fault detection', 'fault detection'],
    'Painting': ['interior painting', 'exterior painting', 'house painting'],
    'Waterproofing': ['damp proofing', 'dampproofing', 'water proofing'],
    'Plastering': ['plaster repair', 'skim coat'],
    'Tiling': ['tile installation', 'tile laying', 'tile repair'],
    'Gate Motor Repair': ['gate automation repair', 'gate motor installation', 'automated gate repair'],
    'Garage Door Repair': ['garage door installation', 'garage door motor repair'],
    '24/7 Emergency': ['24 hour service', '24/7 service', 'emergency callout', 'after hours service', 'emergency service', '24 hours'],
};

const synonymLookup = new Map<string, string>();
for (const [canonical, alts] of Object.entries(SPECIALISATION_SYNONYMS)) {
    for (const alt of alts) {
        synonymLookup.set(canonicalServiceKey(alt), canonical);
    }
}

function normalizeSpecialisations(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const generic = new Set([
        'service',
        'services',
        'home services',
        'contractor',
        'trade',
        'trades',
        'maintenance',
        'general repairs',
    ]);
    const seen = new Set<string>();
    const out: string[] = [];

    for (const raw of input) {
        if (typeof raw !== 'string') continue;
        const cleaned = raw.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '');
        if (!cleaned) continue;
        const key = canonicalServiceKey(cleaned);
        if (!key || generic.has(key) || key.length < 4 || key.length > 60) continue;
        // Check synonym map first — collapse similar terms to a canonical label
        const canonical = synonymLookup.get(key);
        const display = canonical ?? toTitleCase(cleaned);
        const dedupeKey = canonicalServiceKey(display);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(display);
        if (out.length >= 8) break;
    }
    return out;
}

function toSentence(value: string): string {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) return '';
    const first = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return /[.!?]$/.test(first) ? first : `${first}.`;
}

function normalizeHighlights(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of input) {
        if (typeof raw !== 'string') continue;
        const sentence = toSentence(raw);
        if (!sentence) continue;
        const key = sentence
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(sentence);
        if (out.length >= 5) break;
    }
    return out;
}

// ── AI enrichment ─────────────────────────────────────────────────────────────

interface AiEnrichmentOutput {
    bio: string;
    specialisations: string[];
    website_quality: 'high' | 'medium' | 'low' | 'none';
}

/**
 * Unified enrichment output — one Gemini call covering all fields.
 * narrative replaces the old separate about_business + past_work fields.
 */
interface CombinedEnrichmentOutput extends AiEnrichmentOutput {
    review_summary: string;
    narrative: string;
    highlights: string[];
}

/**
 * Reject obviously bad combined outputs before promoting to public provider copy.
 */
function assessCombinedEnrichmentQuality(params: {
    websiteText: string;
    combined: CombinedEnrichmentOutput | null;
    normalizedSpecialisations: string[];
}): 'ok' | 'low' {
    if (!params.combined) return 'low';
    const bio = (params.combined.bio ?? '').trim();
    if (bio.length < 40) return 'low';
    if (/as an artificial intelligence|lorem ipsum/i.test(bio)) return 'low';
    const words = bio.split(/\s+/).filter(Boolean);
    if (words.length >= 12) {
        const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
        if (unique.size / words.length < 0.35) return 'low';
    }
    return 'ok';
}

function computeProfileCompleteness(params: {
    websiteText: string;
    enrichment: AiEnrichmentOutput | null;
}): number {
    const hasWebsiteContent = params.websiteText.trim().length >= MIN_SCRAPE_CHARS;
    if (!hasWebsiteContent) return 0;
    if (!params.enrichment) return 1;
    const hasDeepSignals = (params.enrichment.specialisations?.length ?? 0) > 0;
    return hasDeepSignals ? 3 : 2;
}

const COMBINED_ENRICHMENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        bio: {
            type: Type.STRING,
            description: '2–3 factual sentences: what they do, where, what sets them apart. British English. Max 300 chars. No hollow phrases. Never use the business name — refer to them as "The team" or "They" instead.',
        },
        specialisations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3–8 specific homeowner-facing services. Title Case, max 4 words each, no generic category-only terms.',
        },
        website_quality: {
            type: Type.STRING,
            description: 'One of: high, medium, low, none.',
        },
        highlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3–5 concrete differentiators. Each a full sentence in British English. Never generic.',
        },
        review_summary: {
            type: Type.STRING,
            description: 'Exactly 2 sentences from reviews. Max 140 chars total. British English. Warm, direct. No business name, no numbers, no audience nouns (homeowners/users/customers/clients/residents).',
        },
        narrative: {
            type: Type.STRING,
            description: '3–5 sentences about what the business does, concrete job types, and standout qualities. British English plain prose. Never refer to the business by name — use "The team", "They", or "The business" instead. Separate distinct ideas with \\n\\n to create paragraph breaks.',
        },
    },
    required: ['bio', 'specialisations', 'website_quality', 'highlights', 'review_summary', 'narrative'],
};

async function runCombinedEnrichment(params: {
    providerName: string;
    websiteText: string;
    reviewsText: string;
    cacheVersion: number;
    trade?: string;
    address?: string | null;
    rating?: number | null;
    reviewCount?: number;
    googleGenerativeSummary?: string | null;
    strictSuffix?: string;
}): Promise<CombinedEnrichmentOutput | null> {
    const prompt = `You are Mendr's provider enrichment engine. Extract everything useful about this South African home services business. Be aggressive — specific beats vague, concrete beats generic. Do not invent facts.

Provider: ${params.providerName}
${params.trade ? `Trade: ${params.trade}` : ''}
${params.address ? `Address: ${params.address}` : ''}
${params.rating != null ? `Rating: ${params.rating} (${params.reviewCount ?? 0} reviews)` : ''}
${params.googleGenerativeSummary ? `Google's description: ${params.googleGenerativeSummary}` : ''}

Website:
${params.websiteText || '(none)'}

Reviews:
${params.reviewsText || '(none)'}

Return ONLY valid JSON with these fields: bio, specialisations, website_quality, highlights, review_summary, narrative.
Rules (British English throughout):
- specialisations: strict noun phrases only; Title Case; remove near-duplicate wording.
- highlights: scan for emergency callouts, pricing, qualifications, guarantees, turnaround times. Never hollow phrases.
- review_summary: 2–3 complete sentences, max 350 chars; always end on a full stop.
- narrative: combine context from both website and reviews. Don't echo bio word-for-word.${params.strictSuffix ? `\n\n${params.strictSuffix}` : ''}`.trim();

    try {
        const ai = getGenAiClient();
        const result = await withTimeout(
            ai.models.generateContent({
                model: GEMINI_ENRICHMENT_MODEL_NAME,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.3,
                    topK: 20,
                    topP: 0.75,
                    // gemini-2.5-flash is a thinking model and counts thinking
                    // tokens against maxOutputTokens. Thinking is disabled below
                    // (enrichment is structured extraction, not reasoning) and the
                    // budget is raised for headroom, so the JSON response no longer
                    // truncates mid-string ("Unterminated string in JSON").
                    maxOutputTokens: 2048,
                    responseMimeType: 'application/json',
                    responseSchema: COMBINED_ENRICHMENT_SCHEMA,
                    // Disable model thinking so it does not consume the output budget.
                    thinkingConfig: { thinkingBudget: 0 },
                },
            }),
            AI_ENRICH_TIMEOUT
        );
        const raw = (result.text ?? '').trim();
        return JSON.parse(raw) as CombinedEnrichmentOutput;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = /429|quota|rate.?limit/i.test(msg);
        const isTimeout = msg.includes('Timeout');
        console.error(JSON.stringify({
            type: 'gemini_call_failed',
            fn: 'runCombinedEnrichment',
            isRateLimit,
            isTimeout,
            reason: msg,
            provider: params.providerName,
        }));
        return null;
    }
}

/** Fields the leak gate inspects on combined enrichment output. */
const GUARDED_PROSE_FIELDS = [
    'bio',
    'narrative',
    'review_summary',
] as const satisfies ReadonlyArray<keyof CombinedEnrichmentOutput>;

type GuardedField = (typeof GUARDED_PROSE_FIELDS)[number];

export type EnrichmentLeakReport = {
    safe: CombinedEnrichmentOutput | null;
    droppedFields: GuardedField[];
    failureSummary: string | null;
    attempts: number;
};

const MAX_LEAK_RETRIES = 2;

async function runCombinedEnrichmentGuarded(
    params: Parameters<typeof runCombinedEnrichment>[0],
    log: (entry: Record<string, unknown>) => void
): Promise<EnrichmentLeakReport> {
    let attempts = 0;
    let lastOutput: CombinedEnrichmentOutput | null = null;
    let lastFailures: { field: GuardedField; reason: string; sample: string }[] = [];

    for (let attempt = 0; attempt <= MAX_LEAK_RETRIES; attempt++) {
        attempts = attempt + 1;
        const strictSuffix =
            attempt === 0
                ? undefined
                : `Retry ${attempt}/${MAX_LEAK_RETRIES}: previous output contained ${lastFailures
                      .map((f) => `${f.field} (${f.reason})`)
                      .join(', ')}. Output PLAIN PROSE ONLY. No HTML, no CSS, no markdown fences, no selectors, no attribute lists. If you don't know, return an empty string.`;

        const out = await runCombinedEnrichment({ ...params, strictSuffix }).catch(() => null);
        lastOutput = out;
        if (!out) {
            lastFailures = [];
            continue;
        }

        const failures: { field: GuardedField; reason: string; sample: string }[] = [];
        for (const field of GUARDED_PROSE_FIELDS) {
            const verdict = validateLlmContentSafe(out[field] as string | null | undefined);
            if (!verdict.ok) {
                failures.push({ field, reason: verdict.reason, sample: verdict.sample });
            }
        }

        if (failures.length === 0) {
            if (attempt > 0) {
                log({ type: 'enrichment_leak_recovered', attempts, place: params.providerName });
            }
            return { safe: out, droppedFields: [], failureSummary: null, attempts };
        }

        lastFailures = failures;
        log({
            type: 'enrichment_leak_detected',
            attempt,
            provider_name: params.providerName,
            failures: failures.map((f) => `${f.field}:${f.reason}`),
            sample: failures[0]?.sample ?? null,
        });
    }

    if (!lastOutput) {
        return { safe: null, droppedFields: [], failureSummary: 'combined_enrichment_null', attempts };
    }

    const safe: CombinedEnrichmentOutput = { ...lastOutput };
    const dropped: GuardedField[] = [];
    for (const f of lastFailures) {
        (safe as unknown as Record<string, string>)[f.field] = '';
        dropped.push(f.field);
    }
    const failureSummary = lastFailures.map((f) => `${f.field}:${f.reason}`).slice(0, 6).join(', ');
    return { safe, droppedFields: dropped, failureSummary, attempts };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EnrichProviderResult {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
}

export async function enrichProvider(
    providerId: string,
    options?: { trade?: string; cacheVersion?: number }
): Promise<EnrichProviderResult> {
    const admin = await createSupabaseAdminClient();
    const targetCacheVersion =
        typeof options?.cacheVersion === 'number' && options.cacheVersion > 0
            ? Math.floor(options.cacheVersion)
            : aiConfig.providerEnrichmentCacheVersion;

    const { data: provider, error: provErr } = await admin
        .from('providers')
        .select(
            'id, google_place_id, website, name, summary, rating, rating_count, address, specialisations, latitude, longitude, google_generative_summary, field_sources'
        )
        .eq('id', providerId)
        .eq('is_active', true)
        .maybeSingle();

    if (provErr || !provider) return { ok: false, reason: 'Provider not found' };

    const logPrefix = `[enrichment:${provider.name ?? providerId}]`;
    console.warn(
        JSON.stringify({ type: 'enrichment_start', provider_id: providerId, trade: options?.trade ?? 'unknown', cacheVersion: targetCacheVersion })
    );

    // ── Cache staleness check ─────────────────────────────────────────────────
    const { data: cached } = await admin
        .from('provider_cache')
        .select('scrape_status, scraped_at, enriched_at, cache_version, enrichment_quality')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (cached?.scraped_at) {
        const scrapeAge = Date.now() - new Date(cached.scraped_at).getTime();
        const cachedVersion = typeof cached.cache_version === 'number' ? cached.cache_version : 0;
        const isVersionMatch = cachedVersion === targetCacheVersion;
        // null quality means unevaluated (pre-column or fast-path row) — treat as unknown, not ok
        const quality =
            typeof (cached as { enrichment_quality?: string }).enrichment_quality === 'string'
                ? (cached as { enrichment_quality: string }).enrichment_quality
                : null;
        const enrichedAt = cached.enriched_at;
        const enrichAge = enrichedAt ? Date.now() - new Date(enrichedAt).getTime() : Infinity;
        // 'fast_only' rows have no real scrape or AI enrichment — never skip full enrichment for them
        const isFullEnrichment = cached.scrape_status !== 'fast_only' && cached.scrape_status !== 'fast_insufficient';

        if (
            isFullEnrichment &&
            cached.scrape_status === 'ok' &&
            enrichedAt &&
            quality === 'ok' &&          // must be explicitly confirmed, null is not ok
            scrapeAge < CACHE_TTL_MS &&
            isVersionMatch
        ) {
            return { ok: true, skipped: true, reason: 'Cache fresh' };
        }
        if (
            isFullEnrichment &&
            cached.scrape_status === 'ok' &&
            enrichedAt &&
            quality === 'low' &&
            enrichAge < LOW_QUALITY_RETRY_MS &&
            isVersionMatch
        ) {
            return { ok: true, skipped: true, reason: 'Low quality retry cooling off' };
        }
        if (isFullEnrichment && cached.scrape_status === 'ok' && enrichedAt && scrapeAge < CACHE_TTL_MS && !isVersionMatch) {
            console.warn(
                JSON.stringify({ type: 'enrichment_version_mismatch', provider_id: providerId, cachedVersion, targetCacheVersion })
            );
        }
        if (isFullEnrichment && cached.scrape_status === 'failed' && scrapeAge < FAILED_RETRY_MS && isVersionMatch) {
            return { ok: true, skipped: true, reason: 'Failed recently, retry locked' };
        }
        if (isFullEnrichment && cached.scrape_status === 'ok' && !enrichedAt) {
            console.warn(
                JSON.stringify({ type: 'enrichment_retry_null_enriched_at', provider_id: providerId })
            );
        }
        if (!isFullEnrichment) {
            console.warn(
                JSON.stringify({ type: 'enrichment_fast_path_row', provider_id: providerId, scrape_status: cached.scrape_status })
            );
        }
    }

    // ── Stage 1: Website scraping (reviews fetch runs in parallel) ────────────
    let websiteText = '';
    const website = typeof provider.website === 'string' ? provider.website.trim() : '';

    console.warn(
        JSON.stringify({ type: 'enrichment_stage1_start', provider_id: providerId, website: website || null })
    );
    // Google Places API caps reviews at 5; DataForSEO adds up to 20 per sync.
    // Limit of 25 covers all real data with comfortable headroom.
    const reviewsPromiseFull = admin
        .from('reviews')
        .select('rating, body, source')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'mendr', 'dataforseo'])
        .order('published_at', { ascending: false })
        .limit(25);

    if (website) {
        try {
            const res = await withTimeout(
                fetch(website, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'MendrBot/1.0 (+https://mendr.co.za)', // TODO(mendr-domain): update User-Agent once mendr.co.za is confirmed
                        Accept: 'text/html,application/xhtml+xml',
                    },
                }),
                SCRAPE_TIMEOUT_MS
            );
            if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
                const rawHtml = await res.text();
                const text = stripHtmlForEnrichment(rawHtml);
                if (text.length >= MIN_SCRAPE_CHARS) websiteText = text;
            } else {
                console.warn(
                    JSON.stringify({ type: 'enrichment_scrape_non_html', provider_id: providerId, status: res.status, contentType: res.headers.get('content-type') })
                );
            }
        } catch (err) {
            console.error(
                JSON.stringify({ type: 'enrichment_scrape_error', provider_id: providerId, error: err instanceof Error ? err.message : String(err) })
            );
        }
    }

    // ── Geographic filter — coordinates take precedence over text signals ──────
    // If provider coordinates are available and outside SA, reject immediately.
    // Much more reliable than text-signal detection which penalises generic websites.
    const lat = typeof provider.latitude === 'number' ? provider.latitude : null;
    const lng = typeof provider.longitude === 'number' ? provider.longitude : null;
    if (lat !== null && lng !== null) {
        const inSA =
            lat >= SA_LAT_MIN && lat <= SA_LAT_MAX &&
            lng >= SA_LNG_MIN && lng <= SA_LNG_MAX;
        if (!inSA) {
            console.error(JSON.stringify({ type: 'enrichment_non_sa_coordinates', provider_id: providerId, lat, lng }));
            await admin.from('provider_cache').upsert(
                {
                    provider_id: providerId,
                    google_place_id: provider.google_place_id ?? '',
                    scraped_at: new Date().toISOString(),
                    scrape_status: 'failed',
                    cache_version: targetCacheVersion,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'provider_id' }
            );
            return { ok: false, reason: 'Non-SA coordinates — skipping enrichment' };
        }
    }

    // ── Stage 2: Await the review fetch (started in parallel with Stage 1) ────
    const { data: reviewRows } = await reviewsPromiseFull;
    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const reviewsText = reviews
        .map((r, i) => `Review ${i + 1} (${r.rating ?? 'N/A'}/5): ${r.body ?? ''}`.trim())
        .filter((r) => r.length > 20)
        .join('\n\n');

    const serviceLabels = serviceLabelsFromProvider(provider);
    const primaryTrade = options?.trade || serviceLabels[0] || null;

    // ── Stage 3: Combined AI enrichment ───────────────────────────────────────
    const guardLog = (entry: Record<string, unknown>) => {
        try {
            console.warn(JSON.stringify({ ...entry, provider_id: providerId }));
        } catch {
            // ignore stringify failures
        }
    };
    const guardedReport = await runCombinedEnrichmentGuarded(
        {
            providerName: provider.name,
            websiteText,
            reviewsText,
            cacheVersion: targetCacheVersion,
            trade: primaryTrade ?? undefined,
            address: typeof provider.address === 'string' ? provider.address : null,
            rating: typeof provider.rating === 'number' ? provider.rating : null,
            reviewCount:
                typeof provider.rating_count === 'number' ? provider.rating_count : reviews.length,
            googleGenerativeSummary:
                typeof (provider as Record<string, unknown>).google_generative_summary === 'string'
                    ? ((provider as Record<string, unknown>).google_generative_summary as string)
                    : null,
        },
        guardLog
    );
    const combined = guardedReport.safe;

    if (!combined) {
        console.error(
            JSON.stringify({ type: 'enrichment_ai_failed', provider_id: providerId, attempts: guardedReport.attempts, droppedFields: guardedReport.droppedFields })
        );
    }
    if (guardedReport.droppedFields.length > 0 || guardedReport.failureSummary) {
        try {
            await admin
                .from('providers')
                .update({
                    enrichment_review_required: true,
                    enrichment_last_failure: guardedReport.failureSummary,
                    enrichment_last_failure_at: new Date().toISOString(),
                })
                .eq('id', providerId);
        } catch (err) {
            console.warn(`${logPrefix} Stage 3: failed to flag enrichment_review_required`, err);
        }
    } else {
        try {
            await admin
                .from('providers')
                .update({
                    enrichment_review_required: false,
                    enrichment_last_failure: null,
                    enrichment_last_failure_at: null,
                })
                .eq('id', providerId);
        } catch {
            // best-effort
        }
    }

    const normalizedSpecialisations = normalizeSpecialisations(combined?.specialisations ?? []);
    const normalizedHighlights = normalizeHighlights(combined?.highlights ?? []);

    const enrichmentQuality = assessCombinedEnrichmentQuality({
        websiteText,
        combined,
        normalizedSpecialisations,
    });
    if (enrichmentQuality === 'low' && combined) {
        console.warn(
            JSON.stringify({ type: 'enrichment_quality_low', provider_id: providerId, provider_name: provider.name ?? null })
        );
    }

    const enrichment: AiEnrichmentOutput | null = combined
        ? {
              bio: combined.bio,
              specialisations: normalizedSpecialisations,
              website_quality: combined.website_quality,
          }
        : null;

    const reviewSummary: string | null =
        combined?.review_summary?.trim() ? combined.review_summary.trim() : null;

    // ── Stage 4: Cache write ───────────────────────────────────────────────────
    const now = new Date().toISOString();
    const scrapeStatus = !website ? 'skip' : websiteText.length >= MIN_SCRAPE_CHARS ? 'ok' : 'failed';
    const profileCompleteness = computeProfileCompleteness({ websiteText, enrichment });

    console.warn(
        JSON.stringify({ type: 'enrichment_stage4_cache_write', provider_id: providerId, scrapeStatus, profileCompleteness, enrichmentQuality })
    );

    const { error: cacheErr } = await admin.from('provider_cache').upsert(
        {
            provider_id: providerId,
            google_place_id: provider.google_place_id ?? '',
            scraped_at: now,
            enriched_at: combined ? now : null,
            scrape_status: scrapeStatus,
            bio: enrichment?.bio ?? null,
            specialisations: enrichment?.specialisations ?? [],
            website_quality: enrichment?.website_quality ?? null,
            profile_completeness: profileCompleteness,
            review_summary: reviewSummary,
            highlights: normalizedHighlights.length ? normalizedHighlights : null,
            cache_version: targetCacheVersion,
            updated_at: now,
            enrichment_quality: combined ? enrichmentQuality : null,
        },
        { onConflict: 'provider_id' }
    );

    if (cacheErr) {
        console.error(JSON.stringify({
            type: 'enrichment_cache_write_failed',
            provider_id: providerId,
            provider_name: provider.name ?? null,
            error: cacheErr.message,
        }));
        return { ok: false, reason: `Cache write failed: ${cacheErr.message}` };
    }

    // ── Stage 5: Update provider profile copy ─────────────────────────────────
    // Two-tier protection: fields a contractor has claimed (field_sources[field]
    // === 'contractor') are their own words and must NOT be overwritten by
    // enrichment. Enrichment still BACKFILLS any field the contractor left blank.
    // `summary` (review-derived "Mendr Summary"), rating, and hours are Tier 2
    // observational data and are always refreshed.
    const fieldSources =
        ((provider as { field_sources?: Record<string, string> | null }).field_sources ?? {}) as Record<string, string>;
    const ownedByContractor = (field: string): boolean => fieldSources[field] === 'contractor';

    try {
        const narrative = combined?.narrative?.trim() ?? '';

        // Write profile copy if:
        //   a) enrichment quality passed the full gate ('ok'), OR
        //   b) quality is 'low' but we at least have a usable narrative (>80 chars) —
        //      this covers providers with thin websites / few reviews whose bio is short
        //      but whose narrative is still coherent enough to show.
        const narrativeUsable = narrative.length >= 80;
        if (enrichmentQuality !== 'ok' && !narrativeUsable) {
            return { ok: true };
        }

        const cleanedName = typeof provider.name === 'string' && provider.name.trim()
            ? formatBusinessName(provider.name.trim()) || provider.name.trim()
            : null;

        const patch: Record<string, unknown> = { updated_at: now };
        if (!ownedByContractor('about')) patch.about = narrative || null;
        if (!ownedByContractor('past_work')) patch.past_work = null;
        if (!ownedByContractor('summary_long')) patch.summary_long = narrative || null;
        if (!ownedByContractor('specialisations')) patch.specialisations = enrichment?.specialisations ?? [];
        if (!ownedByContractor('highlights')) patch.highlights = normalizedHighlights.length ? normalizedHighlights : null;
        if (!ownedByContractor('key_person')) patch.key_person = null;
        if (cleanedName && !ownedByContractor('name')) patch.name = cleanedName;

        // Always refresh summary from the latest review enrichment — don't preserve stale copy.
        // This is observational (review-derived), so it stays enrichment-owned even after a claim.
        if (reviewSummary) {
            patch.summary = sanitizeCustomerSummary(reviewSummary);
        }

        if (narrative || combined) {
            await admin.from('providers').update(patch).eq('id', providerId);
        }
    } catch (err) {
        console.error(
            JSON.stringify({ type: 'enrichment_providers_update_error', provider_id: providerId, error: err instanceof Error ? err.message : String(err) })
        );
        // Non-fatal: cache row already written. Attempt minimal fallback.
        // Skip if the contractor has claimed summary_long (their words win).
        if (enrichment?.bio?.trim() && !ownedByContractor('summary_long')) {
            await admin
                .from('providers')
                .update({ summary_long: enrichment.bio.slice(0, 12_000), updated_at: now })
                .eq('id', providerId)
                .then(() => undefined, () => undefined);
        }
    }

    return { ok: true };
}

/**
 * Writes a minimal provider_cache marker so the match UI can stop polling.
 * Uses scrape_status='fast_only' (or 'fast_insufficient') — never 'ok'.
 * Does NOT write enriched_at so the full pipeline is never blocked.
 */
async function upsertFastSummaryNoTextMarker(
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
    params: {
        providerId: string;
        googlePlaceId: string;
        cacheVersion: number;
        logPrefix: string;
        insufficientReviews?: boolean;
    }
): Promise<boolean> {
    const now = new Date().toISOString();
    const { providerId, googlePlaceId, cacheVersion, logPrefix, insufficientReviews } = params;
    // 'fast_insufficient' = not enough reviews; 'fast_only' = had reviews but summary empty
    const markerStatus = insufficientReviews ? 'fast_insufficient' : 'fast_only';
    const gid = googlePlaceId || '';

    const { data: existing } = await admin
        .from('provider_cache')
        .select('provider_id')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (existing?.provider_id) {
        const { error: upErr } = await admin
            .from('provider_cache')
            .update({
                review_summary: null,
                scrape_status: markerStatus,
                cache_version: cacheVersion,
                updated_at: now,
                // enriched_at intentionally NOT written — full enrichment must set this
            })
            .eq('provider_id', providerId);
        if (upErr) {
            console.error(`${logPrefix} Cache marker update error`, upErr);
            return false;
        }
    } else {
        const { error: insErr } = await admin.from('provider_cache').insert({
            provider_id: providerId,
            google_place_id: gid,
            scraped_at: now,
            scrape_status: markerStatus,
            review_summary: null,
            cache_version: cacheVersion,
            updated_at: now,
            // enriched_at intentionally NOT written
        });
        if (insErr) {
            console.error(`${logPrefix} Cache marker insert error`, insErr);
            return false;
        }
    }
    console.warn(
        JSON.stringify({ type: 'enrichment_fast_marker_written', provider_id: providerId, markerStatus })
    );
    return true;
}

/**
 * Fast path for match cards: approved reviews → one short Gemini call → review_summary only.
 * Writes scrape_status='fast_only', never enriched_at — so full enrichProvider is never blocked.
 */
export async function enrichProviderReviewSummaryFast(
    providerId: string,
    options?: { trade?: string; cacheVersion?: number }
): Promise<EnrichProviderResult> {
    const admin = await createSupabaseAdminClient();
    const targetCacheVersion =
        typeof options?.cacheVersion === 'number' && options.cacheVersion > 0
            ? Math.floor(options.cacheVersion)
            : aiConfig.providerEnrichmentCacheVersion;

    const { data: provider, error: provErr } = await admin
        .from('providers')
        .select('id, google_place_id, name')
        .eq('id', providerId)
        .eq('is_active', true)
        .maybeSingle();

    if (provErr || !provider) return { ok: false, reason: 'Provider not found' };

    const logPrefix = `[enrichment-fast:${provider.name ?? providerId}]`;

    const { data: cachedRow } = await admin
        .from('provider_cache')
        .select('review_summary, enriched_at')
        .eq('provider_id', providerId)
        .maybeSingle();

    const existingSummary = typeof cachedRow?.review_summary === 'string' ? cachedRow.review_summary.trim() : '';
    if (existingSummary.length > 0) {
        return { ok: true, skipped: true, reason: 'Summary cached' };
    }

    const { data: reviewRows } = await admin
        .from('reviews')
        .select('*')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'mendr', 'dataforseo'])
        .order('published_at', { ascending: false })
        .limit(25);

    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const reviewBody = (r: Record<string, unknown>) => {
        const b = typeof r.body === 'string' ? r.body.trim() : '';
        if (b) return b;
        const t = typeof r.text === 'string' ? r.text.trim() : '';
        if (t) return t;
        return typeof r.content === 'string' ? r.content.trim() : '';
    };
    const reviewsText = reviews
        .map((r) => `(${r.rating ?? '?'}/5) ${reviewBody(r)}`.trim())
        .filter((s) => s.length > 8)
        .join('\n')
        .slice(0, 8_000);

    const gidEarly = String(provider.google_place_id ?? '');

    if (reviews.length < FAST_SUMMARY_MIN_REVIEWS || reviewsText.length < FAST_SUMMARY_MIN_CORPUS_CHARS) {
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
            insufficientReviews: true,
        });
        if (!marked) return { ok: false, reason: 'Cache marker insert failed (insufficient reviews path)' };
        return { ok: true, skipped: true, reason: 'Insufficient reviews for fast summary' };
    }

    const providerName = typeof provider.name === 'string' ? provider.name.trim() : 'Business';
    const tradeHint = typeof options?.trade === 'string' && options.trade.trim() ? options.trade.trim() : '';

    const prompt = `Summarise what customers say in these reviews about a South African home-services business.

Rules:
- British English. 2–3 complete sentences in \`review_summary\`, max 350 characters total. Always end on a full stop — never cut mid-sentence.
- Do not name the business, address, ratings, or review counts.
- No audience words: homeowners, users, customers, clients, residents.
${tradeHint ? `- Trade context: ${tradeHint}\n` : ''}
Business label (do not repeat in text): ${providerName}

Reviews:
${reviewsText}`.trim();

    let reviewSummary: string | null = null;
    try {
        const ai = getGenAiClient();
        const result = await withTimeout(
            ai.models.generateContent({
                model: GEMINI_ENRICHMENT_MODEL_NAME,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.2,
                    topK: 15,
                    topP: 0.7,
                    maxOutputTokens: 768,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            review_summary: {
                                type: Type.STRING,
                                description: '2–3 complete sentences, max 350 characters total. British English. Warm and direct. Always end on a full stop. No business name, no ratings, no audience nouns (homeowners/customers/clients/residents).',
                            },
                        },
                        required: ['review_summary'],
                    },
                    // Disable thinking — see runCombinedEnrichment. Without this the
                    // thinking tokens consume maxOutputTokens and truncate the JSON.
                    thinkingConfig: { thinkingBudget: 0 },
                },
            }),
            FAST_REVIEW_SUMMARY_AI_MS
        );
        const raw = (result.text ?? '').trim();
        reviewSummary = parseFastReviewSummaryModelJson(raw);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = /429|quota|rate.?limit/i.test(msg);
        console.error(JSON.stringify({ type: 'gemini_call_failed', fn: 'enrichProviderReviewSummaryFast', isRateLimit, reason: msg, provider: providerName }));
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
        });
        if (!marked) return { ok: false, reason: 'Cache marker insert failed after AI error' };
        return { ok: true, skipped: true, reason: 'Fast summary generation failed' };
    }

    if (!reviewSummary) {
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
        });
        if (!marked) return { ok: false, reason: 'Cache marker insert failed (empty model output)' };
        return { ok: true, skipped: true, reason: 'Empty summary from model' };
    }

    const now = new Date().toISOString();
    const gid = String(provider.google_place_id ?? '');

    const { data: existing } = await admin
        .from('provider_cache')
        .select('provider_id')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (existing?.provider_id) {
        const { error: upErr } = await admin
            .from('provider_cache')
            .update({
                review_summary: reviewSummary,
                scrape_status: 'fast_only',   // never 'ok' — full enrichment must set that
                cache_version: targetCacheVersion,
                updated_at: now,
                // enriched_at intentionally NOT written
            })
            .eq('provider_id', providerId);
        if (upErr) {
            console.error(`${logPrefix} Cache update error`, upErr);
            return { ok: false, reason: 'Cache update failed' };
        }
    } else {
        const { error: insErr } = await admin.from('provider_cache').insert({
            provider_id: providerId,
            google_place_id: gid,
            scraped_at: now,
            scrape_status: 'fast_only',       // never 'ok'
            review_summary: reviewSummary,
            cache_version: targetCacheVersion,
            updated_at: now,
            // enriched_at intentionally NOT written
        });
        if (insErr) {
            console.error(`${logPrefix} Cache insert error`, insErr);
            return { ok: false, reason: 'Cache insert failed' };
        }
    }

    console.warn(
        JSON.stringify({ type: 'enrichment_fast_review_summary_written', provider_id: providerId, chars: reviewSummary.length })
    );
    return { ok: true };
}
