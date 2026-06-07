/**
 * Quick test: run the new enrichment prompt against Plumbing It Fine and Pool Care Clinic
 * using the raw_scrape_text already in the DB.
 *
 *   npx tsx scripts/test-enrichment-output.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface EnrichmentOutput {
    bio: string;
    specialisations: string[];
    years_experience: number | null;
    service_areas: string[];
    certifications: string[];
    response_profile: string;
    website_quality: string;
    highlights: string[];
    review_summary: string;
    customer_review_summary: string;
    about_business: string;
    past_work: string;
}

function extractJson(raw: string): EnrichmentOutput | null {
    // Strip markdown fences — handle ```json\n...\n``` or ```\n...\n```
    const stripped = raw
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/, '')
        .trim();
    // Find the outermost { ... } — works even if there's trailing text
    const start = stripped.indexOf('{');
    if (start === -1) return null;
    // Walk forward to find the matching closing brace
    let depth = 0;
    let end = -1;
    for (let i = start; i < stripped.length; i++) {
        if (stripped[i] === '{') depth++;
        else if (stripped[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    if (end === -1) return null;
    try {
        return JSON.parse(stripped.slice(start, end + 1)) as EnrichmentOutput;
    } catch {
        return null;
    }
}

async function runEnrichment(params: {
    providerName: string;
    trade: string;
    address: string;
    rating: number | null;
    ratingCount: number;
    websiteText: string;
    reviewsText: string;
}): Promise<EnrichmentOutput | null> {
    const { providerName, trade, address, rating, ratingCount, websiteText, reviewsText } = params;

    const prompt = `You are Menda's provider enrichment engine. Extract everything useful about this South African home services business. Be aggressive — if something is plausibly inferable from context, include it. Do not invent facts, but do not be conservative either. Specific always beats vague.

Provider: ${providerName}
${trade ? `Primary Trade: ${trade}` : ''}
${address ? `Address: ${address}` : ''}
${rating != null ? `Google Rating: ${rating} (${ratingCount} reviews)` : ''}

Website Content:
${websiteText || '(no website content available)'}

Image Categories Found on Website: (none)

Customer Reviews:
${reviewsText || '(no reviews available)'}

Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "bio": "2-3 sentences. Concrete and factual — what they do, where they operate, what makes them stand out. British English. Max 300 chars. No generic phrases like 'committed to excellence'. Empty string only if there is truly nothing to say.",
  "specialisations": ["up to 8 specific service specialisations extracted from actual content. 'Burst pipe repair', 'geyser installation', 'drain unblocking' beats 'plumbing services'. Prefer specific over category names."],
  "years_experience": null,
  "service_areas": ["suburb or area names they serve. Only if explicitly mentioned in content. Max 10. Empty array if not stated."],
  "certifications": ["specific registrations, accreditations, memberships mentioned. E.g. 'NHBRC Registered', 'PIRB Member', 'Master Plumber Association', 'ECSA'. Max 8. Empty array if none mentioned."],
  "response_profile": "One sentence on their responsiveness or communication style derived from reviews. Max 100 chars. Empty string if unclear.",
  "website_quality": "high|medium|low|none",
  "highlights": ["3-5 specific and concrete selling points that would make a homeowner choose this provider. Extracted from actual content. 'Same-day callouts available', 'PIRB registered', '20+ years experience', 'Free quote within 2 hours' beats 'great service'. Must have at least 1 entry if any meaningful content exists."],
  "review_summary": "Exactly 2 complete sentences summarising what customers say. Max 140 chars total. British English. Warm and direct. No business name, no rating numbers.",
  "customer_review_summary": "3-5 sentences: proportional sentiment — overall tone, consistent praise, recurring complaints if any. No business name or rating numbers.",
  "about_business": "2-3 sentences about what they do and who they serve. Based primarily on website content. Do not echo review sentiment.",
  "past_work": "2-4 sentences: concrete project types, job sizes, or work examples from reviews and website. Specific beats vague."
}

Extraction rules:
- British English throughout.
- bio: no filler. Facts only. Extract actual trade specialties, location focus, and years if available.
- specialisations: scan the whole content — headings, body copy, review mentions, JSON-LD. Extract noun phrases for actual services.
- highlights: be aggressive. Look for emergency availability, pricing transparency, qualifications, equipment, service guarantees, turnaround times, locations, any concrete differentiator.
- service_areas: suburb/area/region names only. Not province or country level.
- website_quality: high = rich services info, team, contact, portfolio; medium = basic but navigable; low = minimal or clearly stale; none = blocked.`.trim();

    const result = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.3, maxOutputTokens: 8192 },
    });
    return extractJson((result.text ?? '').trim());
}

async function main() {
    const PROVIDER_IDS = [
        'd64967b8-90cd-4779-b9b5-e1d332d3b661', // Plumbing It Fine
        'acf71b46-d820-4cda-935a-36c7ed7b1ba0', // Pool Care Clinic
    ];

    const { data: providers } = await admin
        .from('providers')
        .select('id, name, address, rating, rating_count, service_categories')
        .in('id', PROVIDER_IDS);

    const { data: caches } = await admin
        .from('provider_cache')
        .select('provider_id, raw_scrape_text')
        .in('provider_id', PROVIDER_IDS);

    const { data: reviewRows } = await admin
        .from('reviews')
        .select('provider_id, rating, body')
        .in('provider_id', PROVIDER_IDS)
        .eq('status', 'approved')
        .order('published_at', { ascending: false })
        .limit(80);

    for (const p of providers ?? []) {
        const cache = (caches ?? []).find((c) => c.provider_id === p.id);
        const reviews = (reviewRows ?? []).filter((r) => r.provider_id === p.id);
        const websiteText = (cache?.raw_scrape_text ?? '').slice(0, 8000);
        const reviewsText = reviews
            .map((r, i) => `Review ${i + 1} (${r.rating}/5): ${r.body}`)
            .filter((r) => r.length > 20)
            .join('\n\n');
        const trade = ((p.service_categories ?? []) as string[])[0] ?? '';

        console.log('\n' + '═'.repeat(60));
        console.log(`PROVIDER: ${p.name}`);
        console.log(`trade=${trade} | rating=${p.rating} (${p.rating_count}) | reviews=${reviews.length} | website=${websiteText.length} chars`);
        console.log('Running enrichment...\n');

        const out = await runEnrichment({
            providerName: p.name,
            trade,
            address: p.address ?? '',
            rating: p.rating,
            ratingCount: p.rating_count ?? 0,
            websiteText,
            reviewsText,
        });

        if (!out) {
            console.log('❌  PARSE FAILED');
            continue;
        }

        console.log(`bio:\n  ${out.bio}`);
        console.log(`website_quality: ${out.website_quality}`);
        console.log(`\nspecialisations:\n  ${out.specialisations.map((s) => `• ${s}`).join('\n  ')}`);
        console.log(`\nservice_areas:\n  ${out.service_areas.length ? out.service_areas.map((s) => `• ${s}`).join('\n  ') : '(none)'}`);
        console.log(`\ncertifications:\n  ${out.certifications.length ? out.certifications.map((s) => `• ${s}`).join('\n  ') : '(none)'}`);
        console.log(`\nhighlights:\n  ${out.highlights.map((s) => `✓ ${s}`).join('\n  ')}`);
        console.log(`\nresponse_profile: ${out.response_profile}`);
        console.log(`\nreview_summary:\n  ${out.review_summary}`);
        console.log(`\nabout_business:\n  ${out.about_business}`);
        console.log(`\npast_work:\n  ${out.past_work}`);
    }
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
