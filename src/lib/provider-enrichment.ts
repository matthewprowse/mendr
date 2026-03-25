/**
 * Background enrichment pipeline for provider profiles.
 *
 * Stages:
 *   1. Website scraping   – 10 s timeout, need ≥ 100 chars of content
 *   2. Image collection   – up to 8 images downloaded; Gemini classifies each (cap 5)
 *   3. AI enrichment      – single Gemini call → bio, specialisations, …
 *   4. Cache write        – upserts provider_cache row (14-day TTL)
 *
 * Failed scrapes are retry-locked for 48 hours.
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getGeminiModel } from '@/lib/ai-client';
import { summarizeReviews, sanitizeCustomerSummary } from '@/lib/review-summary';
import { generateProviderSummaries } from '@/lib/provider-summaries';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS        = 14 * 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS     = 48 * 60 * 60 * 1000;
const SCRAPE_TIMEOUT_MS   = 10_000;
const IMAGE_FETCH_TIMEOUT = 8_000;
const CLASSIFY_TIMEOUT_MS = 8_000;
const AI_ENRICH_TIMEOUT   = 20_000;
const REVIEW_SUMMARY_MS   = 15_000;
const MAX_IMAGES_FETCH    = 8;
const MAX_IMAGES_CLASSIFY = 5;
const MIN_IMAGE_BYTES     = 5_000;
const MIN_SCRAPE_CHARS    = 100;

function serviceLabelsFromProvider(provider: {
    service_categories?: string[] | null;
    services?: unknown;
}): string[] {
    const cats = provider.service_categories;
    if (Array.isArray(cats) && cats.length > 0) {
        return cats.map((c) => String(c).trim()).filter(Boolean);
    }
    const s = provider.services;
    if (!Array.isArray(s)) return [];
    const out: string[] = [];
    for (const x of s as { short?: string; full?: string }[]) {
        if (x?.short) out.push(String(x.short).trim());
        else if (x?.full) out.push(String(x.full).trim());
    }
    return out.filter(Boolean);
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

async function classifyImage(
    imageBytes: ArrayBuffer,
    mimeType: string
): Promise<ImageCategory> {
    try {
        const model = getGeminiModel();
        const base64 = Buffer.from(imageBytes).toString('base64');
        const result = await withTimeout(
            model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType, data: base64 } },
                            {
                                text:
                                    'Classify this image into exactly one category.\n\n' +
                                    'Categories:\n' +
                                    '- work_photo: actual work being done or completed (installations, repairs, finished projects)\n' +
                                    '- team_photo: tradesperson, team members, or staff\n' +
                                    '- equipment: tools, vehicles, or specialised equipment used for work\n' +
                                    '- premises: workshop, office, or yard belonging to the business\n' +
                                    '- certificate: certificate, award, or accreditation document\n' +
                                    '- discard: logo, icon, banner, stock photo, decorative graphic, or anything unrelated\n\n' +
                                    'Reply with exactly one word from the list above.',
                            },
                        ],
                    },
                ],
                generationConfig: { temperature: 0, maxOutputTokens: 20 },
            }),
            CLASSIFY_TIMEOUT_MS
        );
        const text = result.response
            .text()
            .trim()
            .toLowerCase()
            .replace(/[^a-z_]/g, '');
        return KEEP_CATEGORIES.has(text as ImageCategory) ||  text === 'discard'
            ? (text as ImageCategory)
            : 'discard';
    } catch {
        return 'discard';
    }
}

// ── AI enrichment ─────────────────────────────────────────────────────────────

interface AiEnrichmentOutput {
    bio: string;
    specialisations: string[];
    years_experience: number | null;
    service_areas: string[];
    certifications: string[];
    response_profile: string;
    website_quality: 'high' | 'medium' | 'low' | 'none';
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
        (params.enrichment.specialisations?.length ?? 0) > 0 ||
        (params.enrichment.certifications?.length ?? 0) > 0;

    return hasDeepSignals ? 3 : 2;
}

async function runAiEnrichment(params: {
    providerName: string;
    websiteText: string;
    imageCategories: ImageCategory[];
    reviewsText: string;
    trade?: string;
}): Promise<AiEnrichmentOutput | null> {
    const prompt = `You are Scandio's provider enrichment engine. Analyse this data about a home services provider.

Provider: ${params.providerName}
${params.trade ? `Primary Trade: ${params.trade}` : ''}

Website Content:
${params.websiteText || '(no website content available)'}

Image Categories Found on Website: ${
        params.imageCategories.length > 0 ? params.imageCategories.join(', ') : '(none)'
    }

Customer Reviews:
${params.reviewsText || '(no reviews available)'}

Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "bio": "2-3 sentence professional bio. Concise, factual, British English. Max 280 chars.",
  "specialisations": ["up to 6 specific service specialisations as short noun phrases"],
  "years_experience": null or integer years in business if explicitly mentioned,
  "service_areas": ["area names they serve, max 8, only if explicitly stated"],
  "certifications": ["certifications/accreditations mentioned, max 6"],
  "response_profile": "one sentence describing typical response style. Max 80 chars.",
  "website_quality": "high|medium|low|none"
}

Rules:
- bio: factual only; max 280 characters; omit if nothing meaningful to say → ""
- specialisations: specific to what they do, not generic praise → [] if unknown
- service_areas: [] unless explicitly named in content
- website_quality: high = rich content with clear services and contact; medium = basic but useful; low = minimal/vague; none = no site or blocked
- All string fields use British English spelling`.trim();

    try {
        const model = getGeminiModel();
        const result = await withTimeout(
            model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
            }),
            AI_ENRICH_TIMEOUT
        );
        const raw = result.response.text().trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]) as AiEnrichmentOutput;
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
    options?: { trade?: string }
): Promise<EnrichProviderResult> {
    const admin = await createSupabaseAdminClient();

    // Look up provider
    const { data: provider, error: provErr } = await admin
        .from('providers')
        .select(
            'id, google_place_id, website, name, summary, rating, rating_count, address, services, service_categories'
        )
        .eq('id', providerId)
        .single();

    if (provErr || !provider) return { ok: false, reason: 'Provider not found' };

    // Check cache staleness
    const { data: cached } = await admin
        .from('provider_cache')
        .select('scrape_status, scraped_at')
        .eq('provider_id', providerId)
        .maybeSingle();

    if (cached?.scraped_at) {
        const age = Date.now() - new Date(cached.scraped_at).getTime();
        if (cached.scrape_status === 'ok' && age < CACHE_TTL_MS) {
            return { ok: true, skipped: true, reason: 'Cache fresh' };
        }
        if (cached.scrape_status === 'failed' && age < FAILED_RETRY_MS) {
            return { ok: true, skipped: true, reason: 'Failed recently, retry locked' };
        }
    }

    // ── Stage 1: Website scraping ─────────────────────────────────────────────
    let websiteText = '';
    const website = typeof provider.website === 'string' ? provider.website.trim() : '';
    let rawHtml = '';

    if (website) {
        try {
            const res = await withTimeout(
                fetch(website, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'ScandioBot/1.0 (+https://scandio.app)',
                        Accept: 'text/html,application/xhtml+xml',
                    },
                }),
                SCRAPE_TIMEOUT_MS
            );
            if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
                rawHtml = await res.text();
                const text = stripHtmlForEnrichment(rawHtml);
                if (text.length >= MIN_SCRAPE_CHARS) websiteText = text;
            }
        } catch {
            // Scrape failed — continue with empty text
        }
    }

    // ── Stage 2: Image collection & classification ────────────────────────────
    const keptImages: { category: ImageCategory; path: string }[] = [];
    const imageCategories: ImageCategory[] = [];

    if (rawHtml) {
        const imgRegex = /<img[^>]+src=["']?([^"'>\s]+)["']?/gi;
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

        let analysed = 0;
        for (const imgUrl of candidates) {
            if (analysed >= MAX_IMAGES_CLASSIFY) break;
            try {
                const imgRes = await withTimeout(
                    fetch(imgUrl, {
                        headers: { 'User-Agent': 'ScandioBot/1.0 (+https://scandio.app)' },
                    }),
                    IMAGE_FETCH_TIMEOUT
                ).catch(() => null);

                if (!imgRes?.ok) continue;
                const ct = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim();
                if (!ct.startsWith('image/') || ct.includes('svg')) continue;

                const bytes = await imgRes.arrayBuffer();
                if (bytes.byteLength < MIN_IMAGE_BYTES) continue;

                analysed++;
                const category = await classifyImage(bytes, ct);
                imageCategories.push(category);

                if (KEEP_CATEGORIES.has(category)) {
                    const ext = ct.includes('png')
                        ? 'png'
                        : ct.includes('webp')
                          ? 'webp'
                          : ct.includes('gif')
                            ? 'gif'
                            : 'jpg';
                    const path = `providers/${provider.id}/images/${Date.now()}-${keptImages.length}.${ext}`;
                    const { error: uploadErr } = await admin.storage
                        .from('gallery')
                        .upload(path, bytes, { contentType: ct, upsert: true });
                    if (!uploadErr) keptImages.push({ category, path });
                }
            } catch {
                // Skip individual image errors
            }
        }
    }

    const hasWorkPhotos = keptImages.some((img) => img.category === 'work_photo');

    // ── Stage 3: AI enrichment ────────────────────────────────────────────────
    const { data: reviewRows } = await admin
        .from('reviews')
        .select('rating, body, source')
        .eq('provider_id', providerId)
        .eq('status', 'approved')
        .in('source', ['google', 'scandio'])
        .order('published_at', { ascending: false })
        .limit(40);

    const reviews = Array.isArray(reviewRows) ? reviewRows : [];
    const reviewsText = reviews
        .map((r, i) => `Review ${i + 1} (${r.rating ?? 'N/A'}/5): ${r.body ?? ''}`.trim())
        .filter((r) => r.length > 20)
        .join('\n\n');

    // Generate review summary if reviews exist
    let reviewSummary: string | null = null;
    if (reviews.length > 0) {
        try {
            const summaryResult = await withTimeout(
                summarizeReviews({
                    providerName: provider.name,
                    rating: null,
                    ratingCount: reviews.length,
                    reviews: reviews.slice(0, 15).map((r) => ({ rating: r.rating, text: r.body })),
                }),
                REVIEW_SUMMARY_MS
            );
            if (summaryResult?.summary) reviewSummary = summaryResult.summary;
        } catch {
            // Non-fatal
        }
    }

    const enrichment = await runAiEnrichment({
        providerName: provider.name,
        websiteText,
        imageCategories,
        reviewsText,
        trade: options?.trade,
    }).catch(() => null);

    // ── Stage 4: Cache write ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const scrapeStatus = !website ? 'skip' : websiteText.length >= MIN_SCRAPE_CHARS ? 'ok' : 'failed';
    const profileCompleteness = computeProfileCompleteness({
        websiteText,
        enrichment,
        hasWorkPhotos,
    });

    await admin.from('provider_cache').upsert(
        {
            provider_id: providerId,
            google_place_id: provider.google_place_id ?? '',
            scraped_at: now,
            enriched_at: enrichment ? now : null,
            scrape_status: scrapeStatus,
            bio: enrichment?.bio ?? null,
            specialisations: enrichment?.specialisations ?? [],
            years_experience: enrichment?.years_experience ?? null,
            service_areas: enrichment?.service_areas ?? [],
            certifications: enrichment?.certifications ?? [],
            response_profile: enrichment?.response_profile ?? null,
            website_quality: enrichment?.website_quality ?? null,
            profile_completeness: profileCompleteness,
            images: keptImages.length > 0 ? keptImages : null,
            has_work_photos: hasWorkPhotos,
            review_summary: reviewSummary,
            raw_scrape_text: websiteText ? websiteText.slice(0, 8_000) : null,
            cache_version: 1,
            updated_at: now,
        },
        { onConflict: 'provider_id' }
    );

    // ── Stage 5: Pro profile copy (short gap-fill + long narrative) ─────────
    const reviewBodies = reviews
        .map((r) => (typeof r.body === 'string' ? r.body.trim() : ''))
        .filter((b) => b.length > 0);
    const serviceLabels = serviceLabelsFromProvider(provider);
    const primaryTrade = options?.trade || serviceLabels[0] || null;

    try {
        const summaries = await generateProviderSummaries({
            name: typeof provider.name === 'string' ? provider.name : 'Provider',
            primaryTrade,
            services: serviceLabels.length > 0 ? serviceLabels : undefined,
            address: typeof provider.address === 'string' ? provider.address : null,
            reviewBodies,
            rating: typeof provider.rating === 'number' ? provider.rating : null,
            reviewCount:
                typeof provider.rating_count === 'number' ? provider.rating_count : reviewBodies.length,
            websiteText,
        });

        const aboutBusiness = summaries?.aboutBusiness?.trim() ?? '';
        const pastWork = summaries?.pastWork?.trim() ?? '';
        const narrativeParts = [aboutBusiness, pastWork].filter(Boolean);
        const summaryLong = narrativeParts.join('\n\n').slice(0, 12_000);

        const patch: Record<string, unknown> = {
            about: aboutBusiness || null,
            past_work: pastWork || null,
            summary_long: summaryLong || null,
            updated_at: now,
        };

        const existingSummary =
            typeof provider.summary === 'string' ? provider.summary.trim() : '';
        if (!existingSummary && summaries?.customerReviewSummary?.trim()) {
            patch.summary = sanitizeCustomerSummary(summaries.customerReviewSummary.trim());
        }

        if (summaryLong || aboutBusiness || pastWork || typeof patch.summary === 'string') {
            await admin.from('providers').update(patch).eq('id', providerId);
        }
    } catch {
        // Non-fatal: cache row already written
        if (enrichment?.bio?.trim() || websiteText.length >= MIN_SCRAPE_CHARS) {
            const fallbackLong = [enrichment?.bio?.trim(), websiteText.slice(0, 2_000)].filter(Boolean).join('\n\n');
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

    return { ok: true };
}
