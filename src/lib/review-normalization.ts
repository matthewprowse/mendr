import { getGeminiModel } from '@/lib/ai-client';

export interface NormalizedReview {
    body: string;
    reviewerName: string | null;
}

interface NormalizeInput {
    originalBody: string;
    originalName: string | null;
}

// Simple heuristic check for obviously fake/unusable names.
function isClearlyFakeName(name: string | null): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    if (!trimmed) return true;
    // Too short or mostly symbols/digits.
    if (trimmed.length < 2) return true;
    if (/^[\d\s]+$/.test(trimmed)) return true;
    if (/^user\d*$/i.test(trimmed)) return true;
    if (/^(test|tester|anonymous|anon)$/i.test(trimmed)) return true;
    if (/https?:\/\//i.test(trimmed)) return true;
    return false;
}

// Deterministic fallback names when a fake name is detected.
const FALLBACK_NAMES = [
    'Alex Moyo',
    'Thabo Jacobs',
    'Lerato Daniels',
    'Michael Petersen',
    'Nomsa Dlamini',
    'Sam Pillay',
];

function pickFallbackName(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % FALLBACK_NAMES.length;
    return FALLBACK_NAMES[idx];
}

function toTitleCase(name: string): string {
    return name
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

// Lightweight, non-LLM normalization used as a fallback.
function basicNormalize({ originalBody, originalName }: NormalizeInput): NormalizedReview {
    const body = originalBody.replace(/\s+/g, ' ').trim();
    const safeBody = body.length ? body : '';

    let name: string | null = originalName?.trim() || null;
    if (name) {
        name = toTitleCase(name);
    }
    if (!name || isClearlyFakeName(name)) {
        // Use hash of body as seed so the same review gets the same fallback name.
        const seed = safeBody || originalName || 'fallback';
        name = pickFallbackName(seed);
    }

    return {
        body: safeBody,
        reviewerName: name,
    };
}

/**
 * Normalize a Google review's text and reviewer name for display.
 *
 * - Uses Gemini when available to lightly clean grammar and sentence boundaries.
 * - Always falls back to deterministic normalization if the model is unavailable or errors.
 * - Never changes the underlying dedupe key (`source_ref`) — call sites must use Google IDs.
 */
export async function normalizeReviewForDisplay(
    input: NormalizeInput
): Promise<NormalizedReview> {
    const basic = basicNormalize(input);

    // If there's no body at all, don't bother calling the model.
    if (!basic.body) {
        return basic;
    }

    try {
        const model = getGeminiModel();
        const prompt = [
            'You are a copy editor for customer reviews.',
            'Task:',
            '- Clean up the review text: fix obvious grammar/spelling, ensure proper sentence casing and punctuation.',
            '- Do NOT change the meaning or add new information.',
            '- Clean the reviewer name: title case, remove emojis or obvious junk.',
            '- If the name is clearly fake (e.g. only digits, random characters, or generic like "User"), replace it with a realistic full name.',
            '',
            'Return a single JSON object with this exact shape:',
            '{',
            '  "body": "cleaned review text",',
            '  "reviewerName": "clean reviewer name"',
            '}',
            '',
            'Input:',
            `Review text: """${basic.body}"""`,
            `Reviewer name: """${basic.reviewerName ?? ''}"""`,
        ].join('\n');

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        let parsed: any = null;

        try {
            // Some models may wrap JSON in markdown fences; strip them if present.
            const jsonLike = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
            parsed = JSON.parse(jsonLike);
        } catch {
            parsed = null;
        }

        if (!parsed || typeof parsed !== 'object') {
            return basic;
        }

        const body =
            typeof parsed.body === 'string' && parsed.body.trim().length
                ? parsed.body.trim()
                : basic.body;
        const reviewerNameRaw =
            typeof parsed.reviewerName === 'string' && parsed.reviewerName.trim().length
                ? parsed.reviewerName.trim()
                : basic.reviewerName;

        const final = basicNormalize({
            originalBody: body,
            originalName: reviewerNameRaw ?? null,
        });

        return final;
    } catch {
        // On any failure, fall back to deterministic behavior.
        return basic;
    }
}

