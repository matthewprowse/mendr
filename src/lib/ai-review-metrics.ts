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
4. **metrics**: Score 1–10 (decimal allowed, one decimal place) for each metric. Base scores ONLY on what reviewers explicitly state or unmistakably imply. A metric must be null if no reviews mention it at all.

Metric definitions — read carefully:
   - punctuality: Did the provider arrive on time, meet agreed deadlines, and keep scheduled appointments? Evidence: phrases like "always on time", "arrived early", "ran late", "missed the deadline", "kept us waiting".
   - cleanliness: Did the provider leave the work area tidy? Evidence: "cleaned up after themselves", "left a mess", "neat finish", "rubbish left behind".
   - professionalism: Did the provider communicate well, behave courteously, handle problems maturely, and demonstrate expertise? Evidence: "very professional", "rude", "wouldn't return calls", "handled complaints well", "knowledgeable".
   - value_for_money: Was the pricing fair relative to the quality and completeness of work delivered? Evidence: "great value", "overpriced", "charged for work not done", "worth every cent", "quoted one price then charged more".

Scoring rules:
- Score strictly: 1–3 = clearly poor, 4–5 = below average, 6–7 = average/acceptable, 8–9 = good, 10 = exceptional.
- If most mentions are negative for a metric, score it 1–4. Do not default to mid-range (5–6) when evidence is clearly negative.
- Aggregate across ALL reviews — a single bad review among many good ones should lower the score modestly, not neutralise it entirely.
- Set null only when the metric is genuinely unmentioned across all reviews.

Length of **positives** vs **negatives** should roughly track the ratio of clearly positive to clearly negative/mixed reviews.

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
        model: 'gemini-2.5-flash',
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

const CATEGORY_ORDER = [
    'Punctuality',
    'Professionalism',
    'Cleanliness',
    'Accuracy',
    'Other',
] as const;
export type ReviewCategory = (typeof CATEGORY_ORDER)[number];

export interface ProPageReviewAnalysis {
    reviewCategories: Partial<Record<ReviewCategory, number[]>>;
    summary: string;
    /** Short terms reviewers frequently mention (Google-style "What people mention"). */
    highlights: string[];
}

const PRO_PAGE_REVIEW_PROMPT = `You are analysing Google reviews for a home services provider (plumber, electrician, handyman, etc.). Use British English throughout (e.g. "recognise", "organise", "colour", "specialise", "analyse").

Tasks:
1. **reviewCategories**: For each review (index 0 to N-1), assign it to ONE OR MORE relevant categories. A review may appear in multiple category arrays if it meaningfully mentions multiple topics.
   Categories and what counts as evidence:
   - Punctuality: arriving on time, meeting deadlines, scheduling, time management (e.g. "on time", "ran late", "missed deadline", "never returned").
   - Professionalism: communication, courtesy, handling of problems, maturity, expertise (e.g. "professional", "rude", "wouldn't return calls", "knowledgeable", "handled it well").
   - Cleanliness: cleanliness of work area, leaving the site clean after the job (e.g. "cleaned up", "left a mess", "neat finish", "left the place spotless").
   - Accuracy: quote and diagnosis accuracy — the price and scope of work matching what was quoted and what was actually done (e.g. "quote was accurate", "no hidden costs", "charged more than quoted", "underquoted", "fair and transparent pricing").
   Only use a category when there is clear evidence in the review text, otherwise omit it for that review entirely.
2. **summary**: Write 2–3 short sentences summarising what customers say overall. Cover the main themes (punctuality, professionalism, cleanliness, accuracy), what they praise, and any criticisms. Do not include the business name.
3. **highlights**: Extract 8–20 short terms (one or two words each) that reviewers frequently mention — like Google's "What people mention" for a place. Use lowercase. Examples for a plumber: "on time", "fair price", "clean work", "professional", "quick", "reliable". Examples for a winery: "picnic", "platters", "lawns", "atmosphere", "afternoon", "trees", "kids". Only include terms that actually appear or are strongly implied across the reviews. Return as an array of strings.

Output valid JSON only, no markdown:
{"reviewCategories":{"Punctuality":[0,2],"Professionalism":[1],...},"summary":"...","highlights":["on time","fair price",...]}`;

export async function analyseReviewsForProPage(
    reviews: Array<{ text: string; rating?: number | null }>,
    apiKey: string
): Promise<ProPageReviewAnalysis> {
    if (reviews.length === 0) {
        return { reviewCategories: {}, summary: 'No reviews available yet.', highlights: [] };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
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
            highlights: [],
        };
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]) as {
            reviewCategories?: Record<string, number[]>;
            summary?: string;
            highlights?: string[];
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
        const highlights = Array.isArray(parsed.highlights)
            ? parsed.highlights.filter((h) => typeof h === 'string' && h.trim()).map((h) => h.trim().toLowerCase()).slice(0, 20)
            : [];
        return { reviewCategories, summary, highlights };
    } catch {
        return {
            reviewCategories: { Other: reviews.map((_, i) => i) },
            summary: 'Customer reviews highlight their experience with this provider.',
            highlights: [],
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
        model: 'gemini-2.5-flash',
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
