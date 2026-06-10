/** Minimum trimmed length — used by `/start` and `/api/validate-start-description`. */
export const START_DESCRIPTION_MIN_CHARS = 25;

const MAX_DESCRIPTION_CHARS = 4000;

export type StartDescriptionAssessment = { ok: true } | { ok: false; message: string };

/**
 * Lightweight quality gate for onboarding text: rejects empty-looking input, punctuation spam,
 * and strings that technically meet length but aren't plain-language descriptions.
 */
export function assessStartDescription(raw: string): StartDescriptionAssessment {
    const trimmed = raw.trim();
    if (trimmed.length < START_DESCRIPTION_MIN_CHARS) {
        return {
            ok: false,
            message: `Please enter at least ${START_DESCRIPTION_MIN_CHARS} characters describing the problem.`,
        };
    }
    if (trimmed.length > MAX_DESCRIPTION_CHARS) {
        return {
            ok: false,
            message: 'That description is too long. Please shorten it to the main issue.',
        };
    }

    const lettersMatches = trimmed.match(/\p{L}/gu);
    const letterCount = lettersMatches?.length ?? 0;
    const nonWhitespace = trimmed.replace(/\s/g, '');
    const nonWsLen = Math.max(nonWhitespace.length, 1);

    if (letterCount < 18) {
        return {
            ok: false,
            message: 'Please describe the issue using ordinary words — not only symbols, dots, or numbers.',
        };
    }

    const letterRatio = letterCount / nonWsLen;
    if (letterRatio < 0.42) {
        return {
            ok: false,
            message: 'Add a clearer description with more letters and fewer symbols or placeholders.',
        };
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const substantiveWords = words.filter((w) => /\p{L}{2,}/u.test(w));
    if (substantiveWords.length < 5) {
        return {
            ok: false,
            message: 'Write a short sentence about what is broken or behaving oddly — filler text is not enough.',
        };
    }

    const uniqueLower = new Set(substantiveWords.map((w) => w.toLowerCase()));
    if (uniqueLower.size <= 2 && substantiveWords.length >= 8) {
        return {
            ok: false,
            message: 'Describe the situation in your own words instead of repeating the same few words.',
        };
    }

    const uniqueSymbols = new Set(nonWhitespace.replace(/\p{L}|\p{N}/gu, '').toLowerCase());

    if (/\p{L}*([.])\1{7,}\p{L}*/u.test(trimmed) || /\p{L}*[._\-]{15,}\p{L}*/u.test(trimmed)) {
        return {
            ok: false,
            message: 'Please replace long dot or dash runs with what is actually happening.',
        };
    }

    const uniqueNonAlnumChars = uniqueSymbols.size;
    if (uniqueNonAlnumChars >= 14 && letterRatio < 0.55) {
        return {
            ok: false,
            message: 'Strip out exotic symbols and use a simple description of the problem.',
        };
    }

    const repeatRunMatch = trimmed.match(/(.)\1{14,}/);
    if (repeatRunMatch) {
        return {
            ok: false,
            message: 'Remove long repeated characters and describe the real-world issue.',
        };
    }

    if (/^[.\-_…,:;=+~`'"/\\|\s*%#]+$/.test(nonWhitespace.replace(/\p{N}+/gu, ''))) {
        return {
            ok: false,
            message: 'Use words (not only punctuation or spaces) so we understand the problem.',
        };
    }

    return { ok: true };
}
