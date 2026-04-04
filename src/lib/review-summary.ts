import { getGeminiModel } from '@/lib/ai-client';

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

function tryParseJson(raw: string): Record<string, unknown> | null {
    const text = (raw || '').trim();
    if (!text) return null;

    const stripMarkdown = (s: string) =>
        s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

    const stripped = stripMarkdown(text);
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;
    const candidate = stripped.slice(jsonStart, jsonEnd + 1);
    try {
        return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function extractSummaryFromModelOutput(raw: string): string {
    const text = String(raw || '').trim();
    if (!text) return '';

    const parsed = tryParseJson(text);
    const fromJson = typeof parsed?.summary === 'string' ? parsed.summary : '';
    if (fromJson.trim()) return sanitizeCustomerSummary(fromJson).trim();

    // Common LLM drift: returns {"summary": "..."} with extra wrapper text.
    const jsonField = text.match(/"summary"\s*:\s*"([^"]+)"/i)?.[1] ?? '';
    if (jsonField.trim()) return sanitizeCustomerSummary(jsonField).trim();

    // Last resort: keep direct model text (still AI-generated, not heuristic/template).
    const stripped = text
        .replace(/^```(?:json|text)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    return sanitizeCustomerSummary(stripped).trim();
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

    const prompt = `
You are Scandio's review summariser. Write a short summary of a provider based only on what customers have said.

Critical output rule: The summary text inside {"summary":"..."} must never exceed 100 characters total. Count carefully. If you are approaching 100 characters, end the sentence early with a full stop and close the JSON immediately.

Output format: {"summary":"your text here"}

Writing rules:
1. Write exactly 2 complete sentences, each ending with a full stop
2. Combined length of both sentences must be under 130 characters
3. Write in British English
4. Write like describing a tradesperson to a friend. Warm, honest, direct
5. Never mention the business name, address, rating, review scores, or open/closed status
6. Never quote reviews directly
7. Never use bullet points, lists, percentages, or counts
8. Never mention specific services or trades
9. Lead with what customers consistently praise. If there are real recurring negatives, mention them in the second sentence honestly
10. If reviews are mixed, reflect that honestly
11. Never start any sentence with: Honestly, They, Their, This, The, A, An, It, There, Customers, Reviewers, Most, Many, Overall, Generally, Based, With, Known, Consistently
12. Start the first sentence with a strong specific opener. Examples: "Punctual and efficient," or "Reliable work and good communication," or "Quick to respond and thorough,"
13. Never use em dashes
14. Both sentences must be grammatically complete and end with a full stop
15. Output ONLY the JSON object. No text before or after. No markdown. No code blocks
16. Do not use audience nouns like homeowner(s), user(s), customer(s), client(s), resident(s)

Reviews:
${reviewBlock}
`.trim();

    try {
        const model = getGeminiModel();
        const contents = [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ];

        const result = await model.generateContentStream({
            contents,
            generationConfig: {
                temperature: 0.35,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 1024,
            },
        });

        let fullText = '';
        for await (const chunk of result.stream) {
            fullText += chunk.text();
        }
        if (!fullText.trim()) {
            const response = await result.response;
            fullText =
                typeof response?.text === 'function' ? (response.text as () => string)() : '';
        }

        let summary = extractSummaryFromModelOutput(fullText);
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
    } catch (error) {
        console.warn('summarizeReviews failed:', (error as Error)?.message || 'unknown');
        return null;
    }
    return null;
}

