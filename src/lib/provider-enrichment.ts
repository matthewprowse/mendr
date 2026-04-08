/**
 * Background enrichment pipeline for provider profiles.
 *
 * Stages:
 *   1. Website scraping      – 10 s timeout, need ≥ 100 chars of content
 *   2. Image batch classify  – fetch up to 5 images, classify in ONE Gemini call (R2)
 *   3. Reviews fetch         – load up to 40 approved reviews from Supabase
 *   4. Combined AI call      – ONE Gemini call for bio, specialisations, review summary,
 *                              about_business, past_work (replaces 3 separate calls) (R1)
 *   5. Cache write           – upserts provider_cache row (14-day TTL)
 *   6. Provider copy update  – writes about/past_work/summary_long to providers table
 *
 * Net Gemini calls per provider: 2 (was up to 8).
 * Failed scrapes are retry-locked for 48 hours.
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getGeminiModel } from '@/lib/ai-client';
import { aiConfig } from '@/lib/ai-config';
import { sanitizeCustomerSummary } from '@/lib/review-summary';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS        = 14 * 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS     = 48 * 60 * 60 * 1000;
const SCRAPE_TIMEOUT_MS   = 10_000;
const IMAGE_FETCH_TIMEOUT = 8_000;
const CLASSIFY_TIMEOUT_MS = 8_000; // per-call; batch gets 2× this
const AI_ENRICH_TIMEOUT   = 20_000;
const MAX_IMAGES_FETCH    = 8;
const MAX_IMAGES_CLASSIFY = 5;
const MIN_IMAGE_BYTES     = 5_000;
const MIN_SCRAPE_CHARS    = 100;

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

function toAbsoluteUrl(base: string, src: string): string | null {
    try {
        return new URL(src, base).href;
    } catch {
        return null;
    }
}

function stripHtmlForEnrichment(html: string): string {
    // Extract structured sections before stripping all tags.
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

    // Strip boilerplate from body
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
        .slice(0, 12_000);
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
        .replace(/\bservices?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
        const title = toTitleCase(cleaned);
        const key = canonicalServiceKey(title);
        if (!key || generic.has(key) || key.length < 4 || key.length > 60) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(title);
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

// ── Image classification ──────────────────────────────────────────────────────

type ImageCategory =
    | 'work_photo'
    | 'team_photo'
    | 'equipment'
    | 'premises'
    | 'certificate'
    | 'discard';

const KEEP_CATEGORIES = new Set<ImageCategory>([
    'work_photo',
    'team_photo',
    'equipment',
    'premises',
    'certificate',
]);

/**
 * R2: Classify all images in a single Gemini call instead of one call per image.
 * Reduces image classification from up to 5 separate calls to 1 batch call.
 * Falls back to 'discard' for any image that cannot be parsed from the response.
 */
async function classifyImagesBatch(
    images: Array<{ bytes: ArrayBuffer; mimeType: string }>
): Promise<ImageCategory[]> {
    if (images.length === 0) return [];
    try {
        const model = getGeminiModel();
        const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> =
            images.map((img) => ({
                inlineData: {
                    mimeType: img.mimeType,
                    data: Buffer.from(img.bytes).toString('base64'),
                },
            }));
        parts.push({
            text:
                `Classify each of the ${images.length} image(s) above in order.\n\n` +
                'Categories:\n' +
                '- work_photo: actual work being done or completed (installations, repairs, finished projects)\n' +
                '- team_photo: tradesperson, team members, or staff\n' +
                '- equipment: tools, vehicles, or specialised equipment used for work\n' +
                '- premises: workshop, office, or yard belonging to the business\n' +
                '- certificate: certificate, award, or accreditation document\n' +
                '- discard: logo, icon, banner, stock photo, decorative graphic, or anything unrelated\n\n' +
                `Reply with a JSON array of exactly ${images.length} string(s) from the list above. Example: ["work_photo","discard"]`,
        });
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts }],
                // Slightly longer timeout for batch — still much faster than N sequential calls
                generationConfig: { temperature: 0, maxOutputTokens: 80 },
            }),
            CLASSIFY_TIMEOUT_MS * 2
        );
        const raw = result.response.text().trim();
        const match = raw.match(/\[[\s\S]*?\]/);
        if (!match) return images.map(() => 'discard' as ImageCategory);
        const parsed = JSON.parse(match[0]) as string[];
        return images.map((_, i) => {
            const cat = ((parsed[i] ?? 'discard') as string)
                .toLowerCase()
                .replace(/[^a-z_]/g, '') as ImageCategory;
            return KEEP_CATEGORIES.has(cat) || cat === 'discard' ? cat : ('discard' as ImageCategory);
        });
    } catch {
        return images.map(() => 'discard' as ImageCategory);
    }
}

// ── AI enrichment ─────────────────────────────────────────────────────────────

interface AiEnrichmentOutput {
    bio: string;
    specialisations: string[];
    years_experience: number | null;
    service_areas: string[];
    response_profile: string;
    website_quality: 'high' | 'medium' | 'low' | 'none';
}

/**
 * R1: Unified enrichment output — combines what was previously three separate Gemini calls:
 *   1. runAiEnrichment  (bio, specialisations, years_experience, …)
 *   2. summarizeReviews (short customer-facing card summary)
 *   3. generateProviderSummaries (aboutBusiness, pastWork, customerReviewSummary)
 *
 * Consolidating into one call reduces Gemini usage from 3–4 calls per provider to 1
 * (plus the single batch image classification call), cutting latency and cost by ~75%.
 *
 * R11: Extended with highlights.
 */
interface CombinedEnrichmentOutput extends AiEnrichmentOutput {
    review_summary: string;
    customer_review_summary: string;
    about_business: string;
    past_work: string;
    highlights: string[];
}

function computeProfileCompleteness(params: {
    websiteText: string;
    enrichment: AiEnrichmentOutput | null;
    hasWorkPhotos: boolean;
}): number {
    const hasWebsiteContent = params.websiteText.trim().length >= MIN_SCRAPE_CHARS;
    if (!hasWebsiteContent) return 0;
    if (!params.enrichment) return 1;

    const hasDeepSignals =
        params.hasWorkPhotos ||
        (params.enrichment.specialisations?.length ?? 0) > 0;

    return hasDeepSignals ? 3 : 2;
}

async function runCombinedEnrichment(params: {
    providerName: string;
    websiteText: string;
    imageCategories: ImageCategory[];
    reviewsText: string;
    cacheVersion: number;
    trade?: string;
    address?: string | null;
    rating?: number | null;
    reviewCount?: number;
}): Promise<CombinedEnrichmentOutput | null> {
    const prompt = `You are Scandio's provider enrichment engine. Extract everything useful about this South African home services business. Be aggressive — specific beats vague, concrete beats generic. Do not invent facts.

Provider: ${params.providerName}
Enrichment Version: ${params.cacheVersion}
${params.trade ? `Trade: ${params.trade}` : ''}
${params.address ? `Address: ${params.address}` : ''}
${params.rating != null ? `Rating: ${params.rating} (${params.reviewCount ?? 0} reviews)` : ''}

Website:
${params.websiteText || '(none)'}

Images: ${params.imageCategories.length > 0 ? params.imageCategories.join(', ') : '(none)'}

Reviews:
${params.reviewsText || '(none)'}

Return ONLY valid JSON, no markdown:
{
  "bio": "2-3 factual sentences: what they do, where, what sets them apart. British English. Max 300 chars. No hollow phrases.",
  "specialisations": ["3-8 specific homeowner-facing services only. Format each as Title Case, max 4 words, no punctuation suffix, and no generic category-only terms (e.g. avoid 'Plumbing'). Keep one canonical phrase per service (no variants like 'Geyser Repair' and 'Hot Water Cylinder Repair')."],
  "years_experience": null,
  "service_areas": ["suburb/area names only if explicitly mentioned — not inferred from address. Max 10."],
  "response_profile": "One sentence on responsiveness from reviews. Max 100 chars. Empty string if unclear.",
  "website_quality": "high|medium|low|none",
  "highlights": ["3-5 concrete differentiators a homeowner cares about. Each must be one full sentence in British English ending with punctuation. Never generic."],
  "review_summary": "Exactly 2 sentences from reviews. Max 140 chars total. British English. Warm, direct, no business name, no numbers, and no audience nouns (homeowners/users/customers/clients/residents).",
  "customer_review_summary": "3-5 sentences: overall tone, consistent praise, recurring issues if any. No business name or ratings, and no audience nouns (homeowners/users/customers/clients/residents).",
  "about_business": "2-3 sentences from website content only. Don't echo reviews.",
  "past_work": "2-4 sentences: concrete job types and examples from reviews/website."
}

Rules (British English throughout):
- specialisations: strict noun phrases only; Title Case output; remove near-duplicate wording and keep the clearest canonical phrase.
- highlights: scan for emergency callouts, pricing, qualifications, equipment, guarantees, turnaround times. Never use hollow phrases.
- review_summary: hard cap 140 chars; trim to a sentence boundary if needed.`.trim();

    try {
        const model = getGeminiModel();
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
            }),
            AI_ENRICH_TIMEOUT
        );
        const raw = result.response.text().trim();
        // Strip markdown fences if model wraps output despite instructions
        const stripped = raw
            .replace(/^```(?:json)?\s*\n?/i, '')
            .replace(/\n?```\s*$/, '')
            .trim();
        const start = stripped.indexOf('{');
        if (start === -1) return null;
        let depth = 0;
        let end = -1;
        for (let i = start; i < stripped.length; i++) {
            if (stripped[i] === '{') depth++;
            else if (stripped[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === -1) return null;
        return JSON.parse(stripped.slice(start, end + 1)) as CombinedEnrichmentOutput;
    } catch {
        return null;
    }
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

    // Look up provider
    const { data: provider, error: provErr } = await admin
        .from('providers')
        .select(
            'id, google_place_id, website, name, summary, rating, rating_count, address, specialisations'
        )
        .eq('id', providerId)
        .single();

    if (provErr || !provider) return { ok: false, reason: 'Provider not found' };

    const logPrefix = `[enrichment:${provider.name ?? providerId}]`;
    console.log(
        `${logPrefix} Starting enrichment (trade=${options?.trade ?? 'unknown'}, cacheVersion=${targetCacheVersion})`
    );

    // Check cache staleness
    const { data: cached } = await admin
        .from('provider_cache')
        .select('scrape_status, scraped_at, enriched_at, cache_version')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (cached?.scraped_at) {
        const age = Date.now() - new Date(cached.scraped_at).getTime();
        const cachedVersion =
            typeof cached.cache_version === 'number' ? cached.cache_version : 0;
        const isVersionMatch = cachedVersion === targetCacheVersion;
        // Only skip if BOTH the scrape AND the AI enrichment completed successfully.
        // If enriched_at is null the AI call failed last time — we must retry even if
        // the scrape itself was marked 'ok' and is within the 14-day TTL.
        if (cached.scrape_status === 'ok' && cached.enriched_at && age < CACHE_TTL_MS && isVersionMatch) {
            console.log(
                `${logPrefix} Skipping — cache fresh (scraped=${cached.scraped_at}, enriched=${cached.enriched_at}, version=${cachedVersion})`
            );
            return { ok: true, skipped: true, reason: 'Cache fresh' };
        }
        if (cached.scrape_status === 'ok' && cached.enriched_at && age < CACHE_TTL_MS && !isVersionMatch) {
            console.log(
                `${logPrefix} Cache version mismatch (cached=${cachedVersion}, target=${targetCacheVersion}) — rerunning enrichment`
            );
        }
        if (cached.scrape_status === 'failed' && age < FAILED_RETRY_MS && isVersionMatch) {
            console.log(`${logPrefix} Skipping — scrape failed recently, retry locked`);
            return { ok: true, skipped: true, reason: 'Failed recently, retry locked' };
        }
        if (cached.scrape_status === 'failed' && age < FAILED_RETRY_MS && !isVersionMatch) {
            console.log(
                `${logPrefix} Failed retry lock bypassed due to version change (cached=${cachedVersion}, target=${targetCacheVersion})`
            );
        }
        if (cached.scrape_status === 'ok' && !cached.enriched_at) {
            console.log(`${logPrefix} Retrying — scrape ok but enriched_at is null (previous AI call likely failed)`);
        }
    }

    // ── Stage 1: Website scraping ─────────────────────────────────────────────
    let websiteText = '';
    const website = typeof provider.website === 'string' ? provider.website.trim() : '';
    let rawHtml = '';

    console.log(`${logPrefix} Stage 1: Scraping website — ${website || '(no website)'}`);

    if (website) {
        try {
            const res = await withTimeout(
                fetch(website, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'ScandioBot/1.0 (+https://scandio.co.za)',
                        Accept: 'text/html,application/xhtml+xml',
                    },
                }),
                SCRAPE_TIMEOUT_MS
            );
            if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
                rawHtml = await res.text();
                const text = stripHtmlForEnrichment(rawHtml);
                if (text.length >= MIN_SCRAPE_CHARS) websiteText = text;
                console.log(`${logPrefix} Stage 1: Scraped ${rawHtml.length} bytes → ${websiteText.length} chars of useful text`);
            } else {
                console.log(`${logPrefix} Stage 1: Non-HTML response (status=${res.status}, content-type=${res.headers.get('content-type')})`);
            }
        } catch (err) {
            console.log(`${logPrefix} Stage 1: Scrape failed — ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // ── Geographic filter ─────────────────────────────────────────────────────
    // If we got website content, verify it contains South African geographic or
    // currency signals before proceeding. This catches cases where a Google Place ID
    // incorrectly resolves to a foreign business (e.g. a US pool company).
    console.log(`${logPrefix} Stage 1: Geographic filter — websiteText.length=${websiteText.length}`);
    if (websiteText.length >= MIN_SCRAPE_CHARS) {
        const lower = websiteText.toLowerCase();
        const saSignals = [
            'western cape', 'cape town', 'south africa', '.co.za', 'south african',
            'stellenbosch', 'paarl', 'george', 'knysna', 'mossel bay', 'cape peninsula',
            'atlantic seaboard', 'city bowl', 'northern suburbs', 'southern suburbs',
            'tableview', 'bellville', 'brackenfell', 'wynberg', 'mitchells plain',
            'johannesburg', 'pretoria', 'durban', 'centurion', 'sandton',
            // Rand pricing signals
            'r 1', 'r 2', 'r 3', 'r 4', 'r 5', 'r1 ', 'r2 ', 'r3 ', 'r4 ', 'r5 ',
            'r100', 'r200', 'r300', 'r400', 'r500', 'r600', 'r700', 'r800', 'r900',
            'r1 000', 'r1,0', 'r2,0', 'r3,0',
        ];
        const isSouthAfrican = saSignals.some((signal) => lower.includes(signal));
        if (!isSouthAfrican) {
            console.log(`${logPrefix} Stage 1: No SA signals found in content — marking failed`);
            // Content does not appear to be for a South African business — treat as failed.
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
            return { ok: false, reason: 'Non-SA content detected — skipping enrichment' };
        }
    }

    // ── Stage 3 (early): Fetch reviews in parallel with image classification ────
    // Reviews are completely independent of the website scrape. Starting the DB
    // query now means it overlaps with Stage 2 instead of running after it.
    // The result is awaited just before the AI call in Stage 4.
    console.log(`${logPrefix} Stage 3 (parallel): Starting review fetch`);
    const reviewsPromise = admin
        .from('reviews')
        .select('rating, body, source')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'scandio'])
        .order('published_at', { ascending: false })
        .limit(40);

    // ── Stage 2: Image collection & batch classification (R2) ─────────────────
    // Previously: one Gemini call per image (up to 5 calls × 8 s timeout = 40 s).
    // Now: fetch all images first, then classify in a single batched Gemini call.
    console.log(`${logPrefix} Stage 2: Image collection`);
    const keptImages: { category: ImageCategory; path: string }[] = [];
    const imageCategories: ImageCategory[] = [];

    if (rawHtml) {
        // Match src AND common lazy-load attributes (data-src, data-lazy-src, data-original).
        // Many trade websites use lazy loading — without this, images are invisible to the scraper.
        const imgRegex = /<img[^>]+(?:src|data-src|data-lazy-src|data-lazy|data-original|data-image)=["']?([^"'>\s]+)["']?/gi;
        const candidates: string[] = [];
        let m: RegExpExecArray | null;

        while ((m = imgRegex.exec(rawHtml)) !== null && candidates.length < MAX_IMAGES_FETCH) {
            const src = m[1];
            if (!src) continue;
            if (src.startsWith('data:')) continue;
            if (/\.(svg|ico)(\?|$)/i.test(src)) continue;
            if (/logo|icon|favicon|sprite|bg-|background/i.test(src)) continue;
            const abs = toAbsoluteUrl(website, src);
            if (abs && !candidates.includes(abs)) candidates.push(abs);
        }

        // Fetch up to MAX_IMAGES_CLASSIFY images in parallel, then classify in one batch call.
        const fetchedImages: Array<{ bytes: ArrayBuffer; mimeType: string; ext: string }> = [];
        await Promise.allSettled(
            candidates.slice(0, MAX_IMAGES_CLASSIFY).map(async (imgUrl) => {
                try {
                    const imgRes = await withTimeout(
                        fetch(imgUrl, {
                            headers: { 'User-Agent': 'ScandioBot/1.0 (+https://scandio.co.za)' },
                        }),
                        IMAGE_FETCH_TIMEOUT
                    ).catch(() => null);
                    if (!imgRes?.ok) return;
                    const ct = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim();
                    if (!ct.startsWith('image/') || ct.includes('svg')) return;
                    const bytes = await imgRes.arrayBuffer();
                    if (bytes.byteLength < MIN_IMAGE_BYTES) return;
                    const ext = ct.includes('png')
                        ? 'png'
                        : ct.includes('webp')
                          ? 'webp'
                          : ct.includes('gif')
                            ? 'gif'
                            : 'jpg';
                    fetchedImages.push({ bytes, mimeType: ct, ext });
                } catch {
                    // Skip individual fetch errors
                }
            })
        );

        // Single batch Gemini call to classify all fetched images (R2)
        console.log(`${logPrefix} Stage 2: Fetched ${fetchedImages.length} images, classifying in batch`);
        if (fetchedImages.length > 0) {
            const categories = await classifyImagesBatch(
                fetchedImages.map((f) => ({ bytes: f.bytes, mimeType: f.mimeType }))
            );
            for (let i = 0; i < fetchedImages.length; i++) {
                const category = categories[i] ?? 'discard';
                imageCategories.push(category);
                if (KEEP_CATEGORIES.has(category)) {
                    const { bytes, mimeType, ext } = fetchedImages[i];
                    const path = `providers/${provider.id}/images/${Date.now()}-${keptImages.length}.${ext}`;
                    const { error: uploadErr } = await admin.storage
                        .from('gallery')
                        .upload(path, bytes, { contentType: mimeType, upsert: true });
                    if (!uploadErr) keptImages.push({ category, path });
                }
            }
        }
    }

    const hasWorkPhotos = keptImages.some((img) => img.category === 'work_photo');
    console.log(`${logPrefix} Stage 2: Kept ${keptImages.length} images (hasWorkPhotos=${hasWorkPhotos})`);

    // ── Stage 3: Await the review fetch started in parallel above ────────────
    const { data: reviewRows } = await reviewsPromise;

    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const reviewsText = reviews
        .map((r, i) => `Review ${i + 1} (${r.rating ?? 'N/A'}/5): ${r.body ?? ''}`.trim())
        .filter((r) => r.length > 20)
        .join('\n\n');

    const serviceLabels = serviceLabelsFromProvider(provider);
    const primaryTrade = options?.trade || serviceLabels[0] || null;

    console.log(`${logPrefix} Stage 3: Got ${reviews.length} reviews`);

    // ── Stage 4: Combined AI enrichment (R1) ──────────────────────────────────
    // Previously: runAiEnrichment + summarizeReviews + generateProviderSummaries = 3 Gemini calls.
    // Now: one combined call returning all fields, reducing Gemini usage ~75% per provider.
    console.log(`${logPrefix} Stage 4: Running combined AI enrichment (websiteText=${websiteText.length} chars, reviews=${reviews.length})`);
    const combined = await runCombinedEnrichment({
        providerName: provider.name,
        websiteText,
        imageCategories,
        reviewsText,
        cacheVersion: targetCacheVersion,
        trade: primaryTrade ?? undefined,
        address: typeof provider.address === 'string' ? provider.address : null,
        rating: typeof provider.rating === 'number' ? provider.rating : null,
        reviewCount:
            typeof provider.rating_count === 'number' ? provider.rating_count : reviews.length,
    }).catch(() => null);

    console.log(`${logPrefix} Stage 4: AI enrichment ${combined ? 'succeeded' : 'failed/null'}`);
    if (combined) {
        console.log(`${logPrefix} Stage 4: bio="${combined.bio?.slice(0, 80) ?? ''}", specialisations=${JSON.stringify(combined.specialisations)}, highlights=${combined.highlights?.length ?? 0}`);
    }

    // Map combined output back to the shapes previously returned by separate calls.
    const normalizedSpecialisations = normalizeSpecialisations(combined?.specialisations ?? []);
    const normalizedHighlights = normalizeHighlights(combined?.highlights ?? []);

    const enrichment: AiEnrichmentOutput | null = combined
        ? {
              bio: combined.bio,
              specialisations: normalizedSpecialisations,
              years_experience: combined.years_experience,
              service_areas: combined.service_areas,
              response_profile: combined.response_profile,
              website_quality: combined.website_quality,
          }
        : null;

    const reviewSummary: string | null =
        combined?.review_summary?.trim() ? combined.review_summary.trim() : null;

    // ── Stage 5: Cache write ───────────────────────────────────────────────────
    const now = new Date().toISOString();
    const scrapeStatus = !website ? 'skip' : websiteText.length >= MIN_SCRAPE_CHARS ? 'ok' : 'failed';
    const profileCompleteness = computeProfileCompleteness({
        websiteText,
        enrichment,
        hasWorkPhotos,
    });

    console.log(`${logPrefix} Stage 5: Writing cache (scrapeStatus=${scrapeStatus}, profileCompleteness=${profileCompleteness})`);

    await admin.from('provider_cache').upsert(
        {
            provider_id: providerId,
            google_place_id: provider.google_place_id ?? '',
            scraped_at: now,
            enriched_at: combined ? now : null,
            scrape_status: scrapeStatus,
            bio: enrichment?.bio ?? null,
            specialisations: enrichment?.specialisations ?? [],
            years_experience: enrichment?.years_experience ?? null,
            service_areas: enrichment?.service_areas ?? [],
            response_profile: enrichment?.response_profile ?? null,
            website_quality: enrichment?.website_quality ?? null,
            profile_completeness: profileCompleteness,
            images: keptImages.length > 0 ? keptImages : null,
            has_work_photos: hasWorkPhotos,
            review_summary: reviewSummary,
            raw_scrape_text: websiteText ? websiteText.slice(0, 8_000) : null,
            // R11: Extended fields
            highlights: normalizedHighlights.length ? normalizedHighlights : null,
            cache_version: targetCacheVersion,
            updated_at: now,
        },
        { onConflict: 'provider_id' }
    );

    // ── Stage 6: Update provider profile copy from combined output ─────────────
    console.log(`${logPrefix} Stage 6: Updating providers table`);
    try {
        const aboutBusiness = combined?.about_business?.trim() ?? '';
        const pastWork = combined?.past_work?.trim() ?? '';
        const narrativeParts = [aboutBusiness, pastWork].filter(Boolean);
        const summaryLong = narrativeParts.join('\n\n').slice(0, 12_000);

        const patch: Record<string, unknown> = {
            about: aboutBusiness || null,
            past_work: pastWork || null,
            summary_long: summaryLong || null,
            // R11: Extended display fields — written here so the client-side hook can
            // read them from providers (public table) without needing provider_cache access.
            specialisations: enrichment?.specialisations ?? [],
            service_areas: enrichment?.service_areas ?? [],
            highlights: normalizedHighlights.length ? normalizedHighlights : null,
            updated_at: now,
        };

        const existingSummary =
            typeof provider.summary === 'string' ? provider.summary.trim() : '';
        const customerSummary = combined?.customer_review_summary?.trim();
        if (!existingSummary && customerSummary) {
            patch.summary = sanitizeCustomerSummary(customerSummary);
        }

        if (summaryLong || aboutBusiness || pastWork || typeof patch.summary === 'string' || combined) {
            await admin.from('providers').update(patch).eq('id', providerId);
            console.log(`${logPrefix} Stage 6: Providers table updated`);
        }
    } catch {
        // Non-fatal: cache row already written; attempt a minimal fallback narrative.
        if (enrichment?.bio?.trim() || websiteText.length >= MIN_SCRAPE_CHARS) {
            const fallbackLong = [enrichment?.bio?.trim(), websiteText.slice(0, 2_000)]
                .filter(Boolean)
                .join('\n\n');
            if (fallbackLong.trim()) {
                await admin
                    .from('providers')
                    .update({
                        summary_long: fallbackLong.slice(0, 12_000),
                        updated_at: now,
                    })
                    .eq('id', providerId);
            }
        }
    }

    console.log(`${logPrefix} Enrichment Complete`);
    return { ok: true };
}
