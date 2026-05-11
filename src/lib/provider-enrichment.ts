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
 *
 * Match UI uses `enrichProviderReviewSummaryFast` — one tiny Gemini call from DB reviews only
 * (~1s budget, no scrape/images) so cards populate quickly; full `enrichProvider` can still be run elsewhere.
 */

import { SchemaType } from '@google/generative-ai';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getGeminiModel } from '@/lib/ai-client';
import { aiConfig } from '@/lib/ai-config';
import { sanitizeCustomerSummary } from '@/lib/review-summary';
import {
    FAST_SUMMARY_MIN_CORPUS_CHARS,
    FAST_SUMMARY_MIN_REVIEWS,
    parseFastReviewSummaryModelJson,
} from '@/lib/fast-review-summary';
import {
    CERTIFICATION_CATALOG,
    extractCertificationsFromText,
    getCertificationBySlug,
    type CertificationEntry,
} from '@/lib/certifications/catalog';
import { validateLlmContentSafe } from '@/lib/llm-content-guard';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** After a low-quality AI enrichment, allow retry sooner than full cache TTL. */
const LOW_QUALITY_RETRY_MS = 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS = 48 * 60 * 60 * 1000;
const SCRAPE_TIMEOUT_MS   = 10_000;
const IMAGE_FETCH_TIMEOUT = 8_000;
const CLASSIFY_TIMEOUT_MS = 8_000; // per-call; batch gets 2× this
const AI_ENRICH_TIMEOUT   = 20_000;
/** Single-call review summary for match cards — must exceed cold Gemini latency (2.5s caused mass timeouts in debug FAST_BRANCH). */
const FAST_REVIEW_SUMMARY_AI_MS = 15_000;
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

/**
 * Reject obviously bad combined outputs so they are not promoted to public provider copy;
 * `enrichment_quality` in DB marks rows for shorter retry (see LOW_QUALITY_RETRY_MS).
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
    const hasScrape = params.websiteText.trim().length >= MIN_SCRAPE_CHARS;
    if (hasScrape && params.normalizedSpecialisations.length === 0) return 'low';
    return 'ok';
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
    /** Appended to the prompt on retries when an earlier attempt leaked HTML/CSS. */
    strictSuffix?: string;
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
- review_summary: hard cap 140 chars; trim to a sentence boundary if needed.

HARD RULES — failure to follow these voids the response:
- bio, about_business, past_work, customer_review_summary, review_summary MUST be PLAIN PROSE.
- NEVER include HTML tags or attributes (no <div>, no <span>, no class=, href=, alt=).
- NEVER include CSS (no font-family, no @media, no padding/margin/color declarations, no px/rem/em/vh/vw values, no { }, no #hex, no rgb()).
- NEVER include code fences (\`\`\`), JSON-as-prose, escape sequences (\\n, \\t, \\u00xx), or markdown table syntax.
- NEVER copy raw fragments from the website's HTML, navigation, or cookie banners.
- If you don't know a field, return an empty string — do not pad with HTML/CSS or boilerplate.${params.strictSuffix ? `\n\n${params.strictSuffix}` : ''}`.trim();

    try {
        const model = getGeminiModel();
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                // Cap output — long JSON is unnecessary and slows generation.
                generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
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

/** Fields the leak gate inspects on combined enrichment output. */
const GUARDED_PROSE_FIELDS = [
    'bio',
    'about_business',
    'past_work',
    'customer_review_summary',
    'review_summary',
] as const satisfies ReadonlyArray<keyof CombinedEnrichmentOutput>;

type GuardedField = (typeof GUARDED_PROSE_FIELDS)[number];

export type EnrichmentLeakReport = {
    /** Combined output with failing prose fields blanked out. */
    safe: CombinedEnrichmentOutput | null;
    /** Set of fields that failed the gate after retries. */
    droppedFields: GuardedField[];
    /** Free-form one-line summary suitable for `providers.enrichment_last_failure`. */
    failureSummary: string | null;
    /** Number of attempts made (1 + retries). */
    attempts: number;
};

const MAX_LEAK_RETRIES = 2;

/**
 * Run `runCombinedEnrichment` and guard each prose field against HTML/CSS/structural
 * leakage. On any leak, retry with progressively stricter prompt suffixes up to
 * MAX_LEAK_RETRIES attempts. Fields that still fail are blanked out and reported.
 */
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
        return {
            safe: null,
            droppedFields: [],
            failureSummary: 'combined_enrichment_null',
            attempts,
        };
    }

    const safe: CombinedEnrichmentOutput = { ...lastOutput };
    const dropped: GuardedField[] = [];
    for (const f of lastFailures) {
        (safe as unknown as Record<string, string>)[f.field] = '';
        dropped.push(f.field);
    }
    const failureSummary = lastFailures
        .map((f) => `${f.field}:${f.reason}`)
        .slice(0, 6)
        .join(', ');
    return { safe, droppedFields: dropped, failureSummary, attempts };
}

// ── Structured attributes (filter v2) ────────────────────────────────────────

type CompanySize = 'solo' | 'small' | 'mid' | 'large';

interface StructuredAttributes {
    companySize: CompanySize | null;
    companySizeConfidence: number;
    yearsInBusiness: number | null;
    yearsInBusinessConfidence: number;
    certifications: CertificationEntry[];
}

/**
 * Bucket Google review counts to a coarse company-size estimate. Used as a fallback when
 * Gemini's confidence is low — small SA traders often have no website at all.
 */
function bucketCompanySizeFromRatingCount(ratingCount: number | null | undefined): CompanySize | null {
    if (typeof ratingCount !== 'number' || !Number.isFinite(ratingCount) || ratingCount < 0) return null;
    if (ratingCount <= 30) return 'solo';
    if (ratingCount <= 150) return 'small';
    if (ratingCount <= 500) return 'mid';
    return 'large';
}

/**
 * Heuristic team-count detector for "team of N" / "our N technicians" patterns.
 * Returns the highest plausible number found, or null.
 */
function detectTeamCountFromText(text: string): number | null {
    if (!text) return null;
    const patterns = [
        /\bteam of\s+(\d{1,3})\b/i,
        /\b(\d{1,3})\s+(?:technicians|electricians|plumbers|installers|tradesmen|tradespeople|staff|employees|engineers)\b/i,
        /\bemploys\s+(\d{1,3})\b/i,
        /\bover\s+(\d{1,3})\s+(?:technicians|electricians|plumbers|staff|employees)\b/i,
    ];
    let best: number | null = null;
    for (const re of patterns) {
        const m = text.match(re);
        if (!m) continue;
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n >= 1 && n <= 999) {
            best = best == null ? n : Math.max(best, n);
        }
    }
    return best;
}

function companySizeFromHeadcount(n: number | null): CompanySize | null {
    if (n == null) return null;
    if (n <= 1) return 'solo';
    if (n <= 5) return 'small';
    if (n <= 20) return 'mid';
    return 'large';
}

/**
 * One Gemini call extracting structured filter-v2 fields from a provider's website + reviews scrape.
 * Designed to be cheap (low token cap, JSON schema, short timeout) so it can run alongside the
 * existing combined enrichment without doubling latency.
 */
async function extractStructuredAttributes(params: {
    providerName: string;
    websiteText: string;
    bio: string | null;
    reviewsText: string;
    ratingCount: number | null;
}): Promise<StructuredAttributes> {
    const fallback: StructuredAttributes = {
        companySize: null,
        companySizeConfidence: 0,
        yearsInBusiness: null,
        yearsInBusinessConfidence: 0,
        certifications: [],
    };

    // Heuristic baseline that always runs (works even with no website).
    const headcount = detectTeamCountFromText(`${params.websiteText}\n${params.bio ?? ''}`);
    const heuristicSize =
        companySizeFromHeadcount(headcount) ?? bucketCompanySizeFromRatingCount(params.ratingCount);
    const heuristicCerts = extractCertificationsFromText(
        `${params.websiteText}\n${params.bio ?? ''}`
    );

    fallback.companySize = heuristicSize ?? null;
    fallback.companySizeConfidence = heuristicSize ? 0.4 : 0;
    fallback.certifications = heuristicCerts;

    const usefulText = (params.websiteText || '').trim();
    if (usefulText.length < MIN_SCRAPE_CHARS) {
        return fallback;
    }

    const catalogList = CERTIFICATION_CATALOG.map((c) => `${c.slug} (${c.label})`).join('; ');

    const prompt = `You are Scandio's structured-attribute extractor. Read the South African home services business below and return ONLY valid JSON.

Provider: ${params.providerName}
Bio: ${params.bio ?? '(none)'}

Website:
${usefulText.slice(0, 8_000) || '(none)'}

Reviews:
${params.reviewsText.slice(0, 2_000) || '(none)'}

Catalog of permitted certification slugs:
${catalogList}

Return JSON with exactly these keys:
{
  "company_size": "solo|small|mid|large|null",
  "company_size_confidence": 0.0-1.0,
  "years_in_business": integer or null (1-150),
  "years_in_business_confidence": 0.0-1.0,
  "certifications": [
    { "slug": "<one of the catalog slugs>", "label": "<human label>", "issuer": "<issuer or empty>" }
  ]
}

Rules:
- company_size: "solo" = 1 person, "small" = 2-5, "mid" = 6-20, "large" = 20+. If unclear, set null and confidence 0.
- years_in_business: only fill when "established 19xx" / "since 20xx" / "X+ years experience" appears explicitly. Otherwise null.
- certifications: ONLY use slugs from the catalog above. Reject anything not in the catalog. Do not invent.
- Do not hallucinate. Prefer null over a guess.`;

    try {
        const model = getGeminiModel();
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 600 },
            }),
            AI_ENRICH_TIMEOUT
        );
        const raw = result.response.text().trim();
        const stripped = raw
            .replace(/^```(?:json)?\s*\n?/i, '')
            .replace(/\n?```\s*$/, '')
            .trim();
        const start = stripped.indexOf('{');
        const end = stripped.lastIndexOf('}');
        if (start === -1 || end === -1) return fallback;
        const json = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

        const cs = typeof json.company_size === 'string' ? json.company_size.toLowerCase() : null;
        const csConf = Number(json.company_size_confidence ?? 0);
        const yib = typeof json.years_in_business === 'number' ? Math.floor(json.years_in_business) : null;
        const yibConf = Number(json.years_in_business_confidence ?? 0);

        const certsRaw = Array.isArray(json.certifications) ? json.certifications : [];
        const certs: CertificationEntry[] = [];
        const seen = new Set<string>();
        for (const c of certsRaw) {
            if (!c || typeof c !== 'object') continue;
            const slug =
                typeof (c as Record<string, unknown>).slug === 'string'
                    ? ((c as Record<string, unknown>).slug as string).toLowerCase()
                    : '';
            if (!slug || seen.has(slug)) continue;
            const entry = getCertificationBySlug(slug);
            if (!entry) continue;
            seen.add(slug);
            certs.push(entry);
        }
        // Merge in heuristic certs that the model missed (catalog-bound by extractor).
        for (const heuristic of heuristicCerts) {
            if (!seen.has(heuristic.slug)) {
                seen.add(heuristic.slug);
                certs.push(heuristic);
            }
        }

        const aiCompanySize: CompanySize | null =
            cs === 'solo' || cs === 'small' || cs === 'mid' || cs === 'large' ? cs : null;
        const aiCompanyConfidence = Number.isFinite(csConf) ? Math.max(0, Math.min(1, csConf)) : 0;

        // Decide which company_size wins. Use AI when confident; else fall back to heuristic.
        let finalCompanySize: CompanySize | null = null;
        let finalCompanyConfidence = 0;
        if (aiCompanySize && aiCompanyConfidence >= 0.5) {
            finalCompanySize = aiCompanySize;
            finalCompanyConfidence = aiCompanyConfidence;
        } else if (heuristicSize) {
            finalCompanySize = heuristicSize;
            finalCompanyConfidence = headcount ? 0.65 : 0.4;
        }

        const finalYears: number | null =
            yib !== null && yibConf >= 0.5 && yib >= 1 && yib <= 150 ? yib : null;

        return {
            companySize: finalCompanySize,
            companySizeConfidence: finalCompanyConfidence,
            yearsInBusiness: finalYears,
            yearsInBusinessConfidence: finalYears != null ? Math.max(0, Math.min(1, yibConf)) : 0,
            certifications: certs,
        };
    } catch {
        return fallback;
    }
}

/**
 * Persist structured attributes to `providers` + `provider_certifications`,
 * respecting admin-source stickiness. Admin overrides are never overwritten by enrichment.
 */
async function persistStructuredAttributes(params: {
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    providerId: string;
    attrs: StructuredAttributes;
}): Promise<void> {
    const { admin, providerId, attrs } = params;
    const now = new Date().toISOString();

    // Read existing source columns so admin overrides win.
    const { data: existing } = await admin
        .from('providers')
        .select('company_size, company_size_source, years_in_business, years_in_business_source')
        .eq('id', providerId)
        .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (attrs.companySize) {
        const csSource =
            typeof (existing as { company_size_source?: string } | null)?.company_size_source ===
            'string'
                ? (existing as { company_size_source?: string }).company_size_source
                : null;
        if (csSource !== 'admin') {
            patch.company_size = attrs.companySize;
            patch.company_size_source = 'enrichment';
        }
    }
    if (attrs.yearsInBusiness != null) {
        const yibSource =
            typeof (existing as { years_in_business_source?: string } | null)
                ?.years_in_business_source === 'string'
                ? (existing as { years_in_business_source?: string }).years_in_business_source
                : null;
        if (yibSource !== 'admin') {
            patch.years_in_business = attrs.yearsInBusiness;
            patch.years_in_business_source = 'enrichment';
        }
    }
    if (Object.keys(patch).length > 0) {
        patch.updated_at = now;
        await admin.from('providers').update(patch).eq('id', providerId);
    }

    // Certifications: replace enrichment-sourced rows with the new set, leave admin rows untouched.
    if (attrs.certifications.length > 0) {
        // Delete only rows currently sourced from enrichment so admin overrides persist.
        await admin
            .from('provider_certifications')
            .delete()
            .eq('provider_id', providerId)
            .eq('source', 'enrichment');

        // Look up admin slugs so we don't try to upsert a duplicate that exists with admin source.
        const { data: adminCerts } = await admin
            .from('provider_certifications')
            .select('slug')
            .eq('provider_id', providerId)
            .eq('source', 'admin');
        const adminSlugs = new Set<string>(
            (adminCerts as { slug: string }[] | null)?.map((c) => c.slug) ?? []
        );

        const rows = attrs.certifications
            .filter((c) => !adminSlugs.has(c.slug))
            .map((c) => ({
                provider_id: providerId,
                slug: c.slug,
                label: c.label,
                issuer: c.issuer || null,
                source: 'enrichment' as const,
            }));
        if (rows.length > 0) {
            await admin
                .from('provider_certifications')
                .upsert(rows, { onConflict: 'provider_id,slug' });
        }
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
        .eq('is_active', true)
        .maybeSingle();

    if (provErr || !provider) return { ok: false, reason: 'Provider not found' };

    const logPrefix = `[enrichment:${provider.name ?? providerId}]`;
    console.log(
        `${logPrefix} Starting enrichment (trade=${options?.trade ?? 'unknown'}, cacheVersion=${targetCacheVersion})`
    );

    // Check cache staleness
    const { data: cached } = await admin
        .from('provider_cache')
        .select('scrape_status, scraped_at, enriched_at, cache_version, enrichment_quality')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (cached?.scraped_at) {
        const scrapeAge = Date.now() - new Date(cached.scraped_at).getTime();
        const cachedVersion =
            typeof cached.cache_version === 'number' ? cached.cache_version : 0;
        const isVersionMatch = cachedVersion === targetCacheVersion;
        const quality =
            typeof (cached as { enrichment_quality?: string }).enrichment_quality === 'string'
                ? (cached as { enrichment_quality: string }).enrichment_quality
                : null;
        const enrichedAt = cached.enriched_at;
        const enrichAge = enrichedAt ? Date.now() - new Date(enrichedAt).getTime() : Infinity;

        // Only skip if BOTH the scrape AND the AI enrichment completed successfully.
        // If enriched_at is null the AI call failed last time — we must retry even if
        // the scrape itself was marked 'ok' and is within the 14-day TTL.
        if (
            cached.scrape_status === 'ok' &&
            enrichedAt &&
            quality !== 'low' &&
            scrapeAge < CACHE_TTL_MS &&
            isVersionMatch
        ) {
            console.log(
                `${logPrefix} Skipping — cache fresh (scraped=${cached.scraped_at}, enriched=${cached.enriched_at}, version=${cachedVersion})`
            );
            return { ok: true, skipped: true, reason: 'Cache fresh' };
        }
        if (
            cached.scrape_status === 'ok' &&
            enrichedAt &&
            quality === 'low' &&
            enrichAge < LOW_QUALITY_RETRY_MS &&
            isVersionMatch
        ) {
            console.log(
                `${logPrefix} Skipping — low-quality enrichment retry cooling off (enriched=${cached.enriched_at})`
            );
            return { ok: true, skipped: true, reason: 'Low quality retry cooling off' };
        }
        if (cached.scrape_status === 'ok' && cached.enriched_at && scrapeAge < CACHE_TTL_MS && !isVersionMatch) {
            console.log(
                `${logPrefix} Cache version mismatch (cached=${cachedVersion}, target=${targetCacheVersion}) — rerunning enrichment`
            );
        }
        if (cached.scrape_status === 'failed' && scrapeAge < FAILED_RETRY_MS && isVersionMatch) {
            console.log(`${logPrefix} Skipping — scrape failed recently, retry locked`);
            return { ok: true, skipped: true, reason: 'Failed recently, retry locked' };
        }
        if (cached.scrape_status === 'failed' && scrapeAge < FAILED_RETRY_MS && !isVersionMatch) {
            console.log(
                `${logPrefix} Failed retry lock bypassed due to version change (cached=${cachedVersion}, target=${targetCacheVersion})`
            );
        }
        if (cached.scrape_status === 'ok' && !cached.enriched_at) {
            console.log(`${logPrefix} Retrying — scrape ok but enriched_at is null (previous AI call likely failed)`);
        }
    }

    // ── Stage 1: Website scraping (reviews fetch runs in parallel from here) ─
    let websiteText = '';
    const website = typeof provider.website === 'string' ? provider.website.trim() : '';
    let rawHtml = '';

    console.log(`${logPrefix} Stage 1: Scraping website — ${website || '(no website)'}`);
    const reviewsPromiseFull = admin
        .from('reviews')
        .select('rating, body, source')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'scandio'])
        .order('published_at', { ascending: false })
        .limit(40);

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

    // ── Stage 3: Await the review fetch (started in parallel with Stage 1 scrape) ─
    const { data: reviewRows } = await reviewsPromiseFull;

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
    const guardLog = (entry: Record<string, unknown>) => {
        try {
            console.log(JSON.stringify({ ...entry, provider_id: providerId }));
        } catch {
            // ignore stringify failures
        }
    };
    const guardedReport = await runCombinedEnrichmentGuarded(
        {
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
        },
        guardLog
    );
    const combined = guardedReport.safe;

    console.log(
        `${logPrefix} Stage 4: AI enrichment ${combined ? 'succeeded' : 'failed/null'} (attempts=${guardedReport.attempts}, dropped=${guardedReport.droppedFields.join(',') || 'none'})`
    );
    if (combined) {
        console.log(`${logPrefix} Stage 4: bio="${combined.bio?.slice(0, 80) ?? ''}", specialisations=${JSON.stringify(combined.specialisations)}, highlights=${combined.highlights?.length ?? 0}`);
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
            console.warn(`${logPrefix} Stage 4: failed to flag enrichment_review_required`, err);
        }
    } else {
        // Clear stale flags once we have a clean run.
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

    // Map combined output back to the shapes previously returned by separate calls.
    const normalizedSpecialisations = normalizeSpecialisations(combined?.specialisations ?? []);
    const normalizedHighlights = normalizeHighlights(combined?.highlights ?? []);

    const enrichmentQuality = assessCombinedEnrichmentQuality({
        websiteText,
        combined,
        normalizedSpecialisations,
    });
    if (enrichmentQuality === 'low' && combined) {
        console.log(
            JSON.stringify({
                type: 'enrichment_quality_low',
                provider_id: providerId,
                provider_name: provider.name ?? null,
            })
        );
    }

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
            enrichment_quality: combined ? enrichmentQuality : null,
        },
        { onConflict: 'provider_id' }
    );

    // ── Stage 5b: Filter v2 structured attributes (company_size, years, certifications) ──
    // Runs whether or not the combined enrichment is high quality — heuristic fallbacks let us
    // populate company_size from rating count even for providers without a website.
    try {
        const reviewsTextForAttrs =
            (combined?.customer_review_summary || combined?.review_summary || '').trim();
        const attrs = await extractStructuredAttributes({
            providerName: provider.name ?? 'Provider',
            websiteText,
            bio: combined?.bio ?? null,
            reviewsText: reviewsTextForAttrs,
            ratingCount: provider.rating_count ?? 0,
        });
        await persistStructuredAttributes({ admin, providerId, attrs });
        console.log(
            `${logPrefix} Stage 5b: structured attrs persisted (size=${attrs.companySize ?? 'n/a'}, years=${attrs.yearsInBusiness ?? 'n/a'}, certs=${attrs.certifications.length})`
        );
    } catch (err) {
        console.warn(`${logPrefix} Stage 5b: structured attrs failed`, err);
    }

    // ── Stage 6: Update provider profile copy from combined output ─────────────
    console.log(`${logPrefix} Stage 6: Updating providers table`);
    try {
        if (enrichmentQuality !== 'ok') {
            console.log(`${logPrefix} Stage 6: Skipped — enrichment quality gate (not promoted to public providers row)`);
            console.log(`${logPrefix} Enrichment Complete`);
            return { ok: true };
        }

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

/**
 * Ensures `provider_cache` has a row visible to GET /api/enrich/get (`scrape_status=ok`) with
 * `enriched_at` set so the match UI can leave the loading skeleton (shows "no summary" when text is null).
 */
async function upsertFastSummaryNoTextMarker(
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
    params: {
        providerId: string;
        googlePlaceId: string;
        cacheVersion: number;
        logPrefix: string;
        /** When true, GET exposes `fastSummaryInsufficient` so the client stops polling (vs retryable timeout markers). */
        insufficientReviews?: boolean;
    }
): Promise<boolean> {
    const now = new Date().toISOString();
    const { providerId, googlePlaceId, cacheVersion, logPrefix, insufficientReviews } = params;
    const markerStatus = insufficientReviews ? 'fast_insufficient' : 'ok';
    const gid = googlePlaceId || '';

    const { data: existing } = await admin
        .from('provider_cache')
        .select('provider_id')
        .eq('provider_id', providerId)
        .maybeSingle();

    /** Minimal columns — older DBs omit response_profile, has_work_photos, etc. (insert was failing silently). */
    if (existing?.provider_id) {
        const { error: upErr } = await admin
            .from('provider_cache')
            .update({
                review_summary: null,
                enriched_at: now,
                scrape_status: markerStatus,
                cache_version: cacheVersion,
                updated_at: now,
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
            enriched_at: now,
            scrape_status: markerStatus,
            review_summary: null,
            cache_version: cacheVersion,
            updated_at: now,
        });
        if (insErr) {
            console.error(`${logPrefix} Cache marker insert error`, insErr);
            return false;
        }
    }
    console.log(`${logPrefix} Fast summary marker written (no review text)`);
    return true;
}

/**
 * Fast path for match cards: approved Scandio/Google reviews → one short Gemini JSON → `review_summary` only.
 * Target wall time ≈1s per provider (DB read + single small generation). No website scrape or image work.
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
        console.log(`${logPrefix} Skip — review_summary already present`);
        return { ok: true, skipped: true, reason: 'Summary cached' };
    }

    const { data: reviewRows } = await admin
        .from('reviews')
        .select('*')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'scandio'])
        .order('published_at', { ascending: false })
        .limit(24);

    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const reviewBody = (r: Record<string, unknown>) => {
        const b = typeof r.body === 'string' ? r.body.trim() : '';
        if (b) return b;
        const t = typeof r.text === 'string' ? r.text.trim() : '';
        if (t) return t;
        const c = typeof r.content === 'string' ? r.content.trim() : '';
        return c;
    };
    const reviewsText = reviews
        .map((r) => `(${r.rating ?? '?'}/5) ${reviewBody(r)}`.trim())
        .filter((s) => s.length > 8)
        .join('\n')
        .slice(0, 8_000);

    const gidEarly = String(provider.google_place_id ?? '');

    if (reviews.length < FAST_SUMMARY_MIN_REVIEWS || reviewsText.length < FAST_SUMMARY_MIN_CORPUS_CHARS) {
        console.log(
            `${logPrefix} Skip — insufficient reviews (n=${reviews.length}, chars=${reviewsText.length})`
        );
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
            insufficientReviews: true,
        });
        if (!marked) {
            return { ok: false, reason: 'Cache marker insert failed (insufficient reviews path)' };
        }
        return { ok: true, skipped: true, reason: 'Insufficient reviews for fast summary' };
    }

    const providerName = typeof provider.name === 'string' ? provider.name.trim() : 'Business';
    const tradeHint = typeof options?.trade === 'string' && options.trade.trim() ? options.trade.trim() : '';

    /** Keep this prompt small — huge few-shot blocks caused Gemini to return truncated markdown (`\`\`\`json` only) in production logs. */
    const prompt = `Summarise what customers say in these reviews about a South African home-services business.

Rules:
- British English. Exactly two short sentences in \`review_summary\`, max 140 characters total for that string.
- Do not name the business, address, ratings, or review counts.
- No audience words: homeowners, users, customers, clients, residents.
${tradeHint ? `- Trade context: ${tradeHint}\n` : ''}
Business label (do not repeat in text): ${providerName}

Reviews:
${reviewsText}`.trim();

    let reviewSummary: string | null = null;
    try {
        const model = getGeminiModel();
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 512,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            review_summary: {
                                type: SchemaType.STRING,
                                description:
                                    'Two sentences max, 140 characters total, what reviewers say (no business name).',
                            },
                        },
                        required: ['review_summary'],
                    },
                },
            }),
            FAST_REVIEW_SUMMARY_AI_MS
        );
        const raw = result.response.text().trim();
        reviewSummary = parseFastReviewSummaryModelJson(raw);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.log(`${logPrefix} Fast AI failed — ${errMsg}`);
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
        });
        if (!marked) {
            return { ok: false, reason: 'Cache marker insert failed after AI error' };
        }
        return { ok: true, skipped: true, reason: 'Fast summary generation failed' };
    }

    if (!reviewSummary) {
        const marked = await upsertFastSummaryNoTextMarker(admin, {
            providerId,
            googlePlaceId: gidEarly,
            cacheVersion: targetCacheVersion,
            logPrefix,
        });
        if (!marked) {
            return { ok: false, reason: 'Cache marker insert failed (empty model output)' };
        }
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
                enriched_at: now,
                scrape_status: 'ok',
                cache_version: targetCacheVersion,
                updated_at: now,
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
            enriched_at: now,
            scrape_status: 'ok',
            review_summary: reviewSummary,
            cache_version: targetCacheVersion,
            updated_at: now,
        });
        if (insErr) {
            console.error(`${logPrefix} Cache insert error`, insErr);
            return { ok: false, reason: 'Cache insert failed' };
        }
    }

    console.log(`${logPrefix} Fast review summary written (${reviewSummary.length} chars)`);
    return { ok: true };
}
