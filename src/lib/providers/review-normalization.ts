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
 * Normalize a review's text and reviewer name for display.
 *
 * Previously made a Gemini call per review (up to 40 per provider).
 * The marginal quality improvement over the heuristic pass did not justify
 * the cost (~19 000 calls across all providers for light grammar cleanup).
 * Now delegates entirely to basicNormalize().
 *
 * Call sites are unchanged — the async signature is preserved.
 */
export async function normalizeReviewForDisplay(
    input: NormalizeInput
): Promise<NormalizedReview> {
    return basicNormalize(input);
}

