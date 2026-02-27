import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ReviewInput {
    text: string;
    rating?: number;
}

export interface ReviewAnalysisResult {
    summary: string;
    positives: string[];
    negatives: string[];
    metrics: {
        punctuality: number | null;
        cleanliness: number | null;
        professionalism: number | null;
        value_for_money: number | null;
    };
}

const METRICS_PROMPT = `You are analysing Google reviews for a home services provider (e.g. plumber, electrician, handyman). Output JSON only, no markdown or explanation. Use British English throughout (e.g. "recognise", "organise", "colour", "specialise", "analyse").

Tasks:
1. **summary**: Write exactly 2 short sentences summarising overall sentiment and what customers say about this provider.
2. **positives**: Array of 2–6 short recurring themes from positive feedback (e.g. "Always on time", "Neat work", "Clear communication"). Each item under 40 chars.
3. **negatives**: Array of 0–4 short recurring themes from negative or mixed feedback (e.g. "Expensive call-out fee", "Sometimes late"). Each item under 40 chars. Omit if no clear negatives.
4. **metrics**: Score 1–10 (decimal allowed, one decimal place) for each, based only on what reviews explicitly or clearly imply:
   - punctuality: Arriving on time, keeping appointments
   - cleanliness: Leaving the job site clean, neat work, overall cleanliness when work is done
   - professionalism: Communication, courtesy, expertise
   - value_for_money: Fairness of pricing, perceived value compared to what was delivered

If there is no clear evidence in the reviews for a metric, set that metric to null in the JSON (not 0 or 5). Be strict: only score higher or lower when reviews support it.

Length of **positives** vs **negatives** should roughly track the ratio of clearly positive to clearly negative/mixed reviews: more positive themes when reviews are mostly positive, more negative themes only when there is a meaningful amount of negative feedback.

Output format (valid JSON only):
{"summary":"...","positives":["...","..."],"negatives":["..."],"metrics":{"punctuality":7.5,"cleanliness":8,"professionalism":9,"value_for_money":7}}`;

export async function analyseReviewsWithGemini(
    reviews: ReviewInput[],
    apiKey: string
): Promise<ReviewAnalysisResult> {
    if (reviews.length === 0) {
        return {
            summary: 'No reviews available yet.',
            positives: ['-'],
            negatives: ['-'],
            metrics: {
                punctuality: null,
                cleanliness: null,
                professionalism: null,
                value_for_money: null,
            },
        };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.2 },
    });

    const reviewsText = reviews
        .slice(0, 20)
        .map((r, i) => `[${i + 1}] Rating: ${r.rating ?? 'N/A'}\n${r.text}`)
        .join('\n\n');

    const prompt = `${METRICS_PROMPT}\n\nReviews:\n${reviewsText}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Gemini did not return valid JSON for review analysis');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: string;
        positives?: string[];
        negatives?: string[];
        metrics?: {
            punctuality?: number | null;
            cleanliness?: number | null;
            professionalism?: number | null;
            value_for_money?: number | null;
        };
    };

    const clampOrNull = (value: unknown): number | null => {
        if (typeof value !== 'number') return null;
        const n = Number(value);
        if (Number.isNaN(n)) return null;
        return Math.min(10, Math.max(1, n));
    };

    return {
        summary:
            typeof parsed.summary === 'string' && parsed.summary.trim()
                ? parsed.summary.trim()
                : 'No summary available.',
        positives: Array.isArray(parsed.positives)
            ? parsed.positives.filter((p) => typeof p === 'string').slice(0, 10)
            : [],
        negatives: Array.isArray(parsed.negatives)
            ? parsed.negatives.filter((p) => typeof p === 'string').slice(0, 6)
            : [],
        metrics: {
            punctuality: clampOrNull(parsed.metrics?.punctuality ?? null),
            cleanliness: clampOrNull(parsed.metrics?.cleanliness ?? null),
            professionalism: clampOrNull(parsed.metrics?.professionalism ?? null),
            value_for_money: clampOrNull(parsed.metrics?.value_for_money ?? null),
        },
    };
}

const CATEGORY_ORDER = ['Punctuality', 'Tidiness', 'Professionalism', 'Quality', 'Value', 'Other'] as const;
export type ReviewCategory = (typeof CATEGORY_ORDER)[number];

export interface ProPageReviewAnalysis {
    reviewCategories: Partial<Record<ReviewCategory, number[]>>;
    summary: string;
}

const PRO_PAGE_REVIEW_PROMPT = `You are analysing Google reviews for a home services provider (plumber, electrician, handyman, etc.). Use British English throughout (e.g. "recognise", "organise", "colour", "specialise", "analyse").

Tasks:
1. **reviewCategories**: For each review (index 0 to N-1), assign exactly ONE category. Put each review index in the right category array.
   Categories: Punctuality (on time, scheduling), Tidiness (clean work, leaving site clean), Professionalism (communication, expertise, courtesy), Quality (work quality, results), Value (pricing, value for money), Other (anything that doesn't fit).
2. **summary**: Write 5–8 sentences summarising what customers say overall. Cover: common themes (e.g. punctuality, quality, value), what they praise, any criticisms, and overall sentiment. Be specific and detailed where the reviews give detail. Mention the range of services praised if relevant. Do not include the business name.

Output valid JSON only, no markdown:
{"reviewCategories":{"Punctuality":[0,2],"Tidiness":[1],"Professionalism":[3],...},"summary":"..."}
Every review index must appear in exactly one category. Use "Other" for unclear.`;

export async function analyseReviewsForProPage(
    reviews: Array<{ text: string; rating?: number | null }>,
    apiKey: string
): Promise<ProPageReviewAnalysis> {
    if (reviews.length === 0) {
        return { reviewCategories: {}, summary: 'No reviews available yet.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.2 },
    });

    const reviewsText = reviews
        .slice(0, 20)
        .map((r, i) => `[${i}] Rating: ${r.rating ?? 'N/A'}\n${r.text}`)
        .join('\n\n');

    const prompt = `${PRO_PAGE_REVIEW_PROMPT}\n\nReviews:\n${reviewsText}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return {
            reviewCategories: { Other: reviews.map((_, i) => i) },
            summary: 'Customer reviews highlight their experience with this provider.',
        };
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]) as {
            reviewCategories?: Record<string, number[]>;
            summary?: string;
        };
        const reviewCategories: ProPageReviewAnalysis['reviewCategories'] = {};
        if (parsed.reviewCategories && typeof parsed.reviewCategories === 'object') {
            for (const cat of CATEGORY_ORDER) {
                const arr = parsed.reviewCategories[cat];
                if (Array.isArray(arr)) {
                    const indices = arr.filter((n) => typeof n === 'number' && n >= 0 && n < reviews.length);
                    if (indices.length) reviewCategories[cat as ReviewCategory] = indices;
                }
            }
            const other = parsed.reviewCategories['Other'];
            if (Array.isArray(other)) {
                const indices = other.filter((n) => typeof n === 'number' && n >= 0 && n < reviews.length);
                if (indices.length) reviewCategories.Other = indices;
            }
        }
        const summary =
            typeof parsed.summary === 'string' && parsed.summary.trim()
                ? parsed.summary.trim()
                : 'Customer reviews highlight their experience with this provider.';
        return { reviewCategories, summary };
    } catch {
        return {
            reviewCategories: { Other: reviews.map((_, i) => i) },
            summary: 'Customer reviews highlight their experience with this provider.',
        };
    }
}

export async function getAboutCompany(
    businessName: string,
    summary: string | null,
    services: Array<{ short?: string; full?: string }>,
    apiKey: string
): Promise<string> {
    if (!summary?.trim() && (!services || services.length === 0)) {
        return `${businessName} is a local home services provider. Check their listing for more details.`;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { temperature: 0.3 },
    });

    const servicesList = (services || [])
        .slice(0, 10)
        .map((s) => s?.full || s?.short || '')
        .filter(Boolean)
        .join(', ') || 'general home services';

    const prompt = `Write a detailed "About" paragraph (3–5 sentences) for a local home services business. Use ONLY the following information. Do not invent facts (no "founded in", "family-owned" unless you can infer from tone). Focus on: what kind of work they do, who they serve, their strengths, and the tone of the summary. If the services suggest a specialisation, mention it. Do not include the business name in the paragraph. Use British English throughout (e.g. "specialise", "recognise", "colour", "organise"). Output plain text only, no quotes or labels.

Business name: ${businessName}
Summary from reviews/listing: ${summary || 'Not provided'}
Services/categories: ${servicesList}`;

    try {
        const result = await model.generateContent(prompt);
        const text = (result.response.text() || '').trim();
        return text || `${businessName} provides ${servicesList}. Local provider.`;
    } catch {
        return `${businessName} provides ${servicesList}. Local home services provider.`;
    }
}
