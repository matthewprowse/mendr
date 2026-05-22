import { SchemaType } from '@google/generative-ai';
import { getGeminiModel } from '@/lib/ai/ai-client';

type ReviewLike = {
    rating?: number | null;
    text?: string | { text?: string } | null;
    originalText?: string | { text?: string } | null;
};

function getReviewText(r: ReviewLike): string {
    const candidate = r?.originalText ?? r?.text;
    if (!candidate) return '';
    if (typeof candidate === 'string') return candidate;
    const t = (candidate as { text?: string }).text;
    return typeof t === 'string' ? t : '';
}

export function sanitizeCustomerSummary(text: string): string {
    if (!text) return '';
    const cleaned = String(text)
        .replace(/[“”]/g, '')
        .replace(/[‘’]/g, '')
        .replace(/""/g, '')
        .replace(/''/g, '')
        .replace(/—/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    // Product copy rule: avoid audience nouns in provider summaries.
    return cleaned
        .replace(/\bhomeowners?\b/gi, 'people')
        .replace(/\busers?\b/gi, 'people')
        .replace(/\bcustomers?\b/gi, 'people')
        .replace(/\bclients?\b/gi, 'people')
        .replace(/\bresidents?\b/gi, 'people')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function computeRatingBucket(reviews: ReviewLike[]): { pos: number; neg: number; neu: number } {
    const bucket = { pos: 0, neg: 0, neu: 0 };
    for (const r of reviews) {
        const rr = typeof r?.rating === 'number' ? r.rating : null;
        if (rr == null) {
            bucket.neu += 1;
            continue;
        }
        if (rr >= 4) bucket.pos += 1;
        else if (rr <= 2) bucket.neg += 1;
        else bucket.neu += 1;
    }
    return bucket;
}

/**
 * Gemini-generated review summary.
 * The output is kept short (2–3 sentences) and avoids mentioning percentages.
 */
export async function summarizeReviews(params: {
    providerName?: string;
    rating: number | null;
    ratingCount: number;
    reviews: ReviewLike[];
}): Promise<{ summary: string; meta: { kind: 'reviews'; pos: number; neg: number; neu: number } } | null> {
    const list = Array.isArray(params.reviews) ? params.reviews : [];
    if (list.length === 0) return null;

    const bucket = computeRatingBucket(list);

    const cleanedReviews = list
        .map((r, i) => {
            const rating = typeof r?.rating === 'number' ? r.rating : null;
            const text = getReviewText(r).trim();
            if (!text) return null;
            return {
                i: i + 1,
                rating,
                text: text.length > 450 ? text.slice(0, 450) : text,
            };
        })
        .filter(Boolean) as Array<{ i: number; rating: number | null; text: string }>;

    if (cleanedReviews.length === 0) return null;

    // Keep payload reasonable
    const payload = cleanedReviews.slice(0, 18);

    const reviewBlock = payload
        .map((r) => `Review ${r.i} (rating: ${r.rating == null ? 'N/A' : r.rating}): ${r.text}`)
        .join('\n\n');

    const prompt = `You are Mendr's review summariser. Write a short summary of a South African home-services provider based only on what customers have said.

Rules:
1. Exactly 2 complete sentences, each ending with a full stop. Combined length under 130 characters.
2. British English. Warm, honest, direct — like describing a tradesperson to a friend.
3. Never mention: business name, address, rating score, review count, open/closed status.
4. Never quote reviews directly or use bullet points, lists, percentages, or counts.
5. Never use audience nouns: homeowners, users, customers, clients, residents.
6. Lead with what reviewers consistently praise. If there are real recurring negatives, mention them honestly in the second sentence.
7. Never start a sentence with: They, Their, This, The, A, An, It, There, Customers, Reviewers, Most, Many, Overall, Generally, Based, With, Known.
8. No em dashes.

Reviews:
${reviewBlock}`.trim();

    try {
        const model = getGeminiModel();

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.35,
                topP: 0.7,
                topK: 20,
                maxOutputTokens: 256,
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        summary: {
                            type: SchemaType.STRING,
                            description: 'Exactly 2 complete sentences, combined under 130 characters. British English. No business name, no rating numbers, no audience nouns (homeowners/customers/clients/residents), no em dashes. Lead with specific praise.',
                        },
                    },
                    required: ['summary'],
                } as any,
            },
        });

        const raw = result.response.text().trim();
        const parsed = JSON.parse(raw) as { summary: string };
        let summary = sanitizeCustomerSummary(parsed.summary?.trim() ?? '');
        if (summary) {
            // Hard ceiling for UI fit (4-line card clamp). Keep complete sentences only.
            const MAX_CHARS = 130;
            if (summary.length > MAX_CHARS) {
                const candidate = summary.slice(0, MAX_CHARS);
                const lastPeriodIdx = candidate.lastIndexOf('.');
                if (lastPeriodIdx > 0) {
                    summary = candidate.slice(0, lastPeriodIdx + 1).trim();
                } else {
                    summary = candidate.trim();
                }
                summary = summary.endsWith('.') ? summary : summary ? `${summary}.` : summary;
            }
            return { summary, meta: { kind: 'reviews', ...bucket } };
        }
    } catch (err) {
        console.warn('summarizeReviews failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
    return null;
}

