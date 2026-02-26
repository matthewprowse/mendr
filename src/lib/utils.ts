import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Try to parse AI response JSON with multiple strategies. Returns { message?, ... } or null. */
export function tryParseDiagnosisJson(raw: string): Record<string, unknown> | null {
    if (!raw?.trim()) return null;
    const stripMarkdown = (s: string) =>
        s
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

    const candidates = [
        raw.match(/<json>([\s\S]*?)(?:<\/json>|$)/i)?.[1],
        raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
        raw.trim(),
    ]
        .filter(Boolean)
        .map((s) => stripMarkdown(s!));

    for (const candidate of candidates) {
        let toParse = candidate;
        if (!toParse.endsWith('}')) {
            const lastBrace = toParse.lastIndexOf('}');
            if (lastBrace !== -1) toParse = toParse.substring(0, lastBrace + 1);
        }
        toParse = toParse.replace(/,(\s*[}\]])/g, '$1');
        try {
            return JSON.parse(toParse) as Record<string, unknown>;
        } catch {
            continue;
        }
    }
    const msgTag = raw.match(/<message>([\s\S]*?)<\/message>/i);
    if (msgTag?.[1]?.trim()) {
        return {
            message: msgTag[1].trim(),
            diagnosis: '',
            trade: 'N/A',
            action_required: 'N/A',
            estimated_cost: 'N/A',
        };
    }
    return null;
}

/** Extract message from raw text when JSON parse fails. Handles multiline and escaped content. */
export function extractMessageFromRaw(raw: string): string | null {
    const patterns = [
        /<message>([\s\S]*?)<\/message>/i,
        /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        /"message"\s*:\s*"([^"]*)"/,
        /'message'\s*:\s*'([^']*)'/,
    ];
    for (const p of patterns) {
        const m = raw.match(p);
        if (m?.[1]) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    }
    const withoutThought = raw
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();
    if (
        withoutThought.length > 30 &&
        !withoutThought.startsWith('<') &&
        !withoutThought.startsWith('{') &&
        !withoutThought.startsWith('[')
    ) {
        return withoutThought.slice(0, 1500);
    }
    return null;
}

/** Normalise phone number for WhatsApp wa.me links. Returns digits only in international format. */
export function toWhatsAppPhone(phone: string | undefined | null): string | null {
    if (!phone?.trim()) return null;
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length < 9) return null;
    if (digits.startsWith('27') && digits.length >= 11) return digits;
    if (digits.startsWith('0') && digits.length === 10) return '27' + digits.slice(1);
    if (digits.length === 9 && !digits.startsWith('0')) return '27' + digits;
    return digits;
}

/** Returns true only if the number is a valid mobile number that supports WhatsApp.
 * WhatsApp requires mobile numbers — landlines don't work.
 * For South Africa: mobile = 06x, 07x, 08x (international: 27 6x, 7x, 8x + 8 digits).
 * Landlines (021, 031, 011...) are rejected. Only SA mobile format accepted. */
export function isWhatsAppCapablePhone(phone: string | undefined | null): boolean {
    const normalized = toWhatsAppPhone(phone);
    if (!normalized) return false;
    if (normalized.startsWith('27') && normalized.length === 11) {
        const third = normalized.charAt(2);
        return third === '6' || third === '7' || third === '8';
    }
    return false;
}

/** Format unknown error for API responses. Returns user-safe message. */
export function formatApiError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Internal error';
}

/** Extract ZAR amount ranges from text, e.g. "R350–R500", "R1,200 to R2,500", or "R1,200". Returns up to 2 unique ranges for call-out and repair. */
export function extractRandRanges(text: string): string[] {
    if (!text?.trim()) return [];
    const matches = text.match(/R[\d,]+(?:[–\-]\s*R?[\d,]+|\s+to\s+R[\d,]+)?/gi) ?? [];
    const seen = new Set<string>();
    return matches.filter((m) => {
        const norm = m.replace(/\s+/g, ' ').replace(/\sto\s/i, '–').trim();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });
}

/** Parse repair and replacement ranges from combined fee text. Returns { repair, replacement }. */
export function parseRepairReplacementRanges(text: string): {
    repair: string | null;
    replacement: string | null;
} {
    if (!text?.trim()) return { repair: null, replacement: null };
    const t = text.trim();
    const repairMatch = t.match(
        /(?:repair|repairing)(?:[:\s]+|,\s*|\s+for\s+|\s+\()(R[\d,]+(?:[–\-]\s*R?[\d,]+|\s+to\s+R[\d,]+)?)/i
    );
    const replacementMatch = t.match(
        /(?:replacement|replacing)(?:[:\s]+|,\s*|\s+for\s+|\s+\()(R[\d,]+(?:[–\-]\s*R?[\d,]+|\s+to\s+R[\d,]+)?)/i
    );
    const ranges = extractRandRanges(t);
    return {
        repair: repairMatch?.[1]?.trim() ?? ranges[0] ?? null,
        replacement: replacementMatch?.[1]?.trim() ?? ranges[1] ?? null,
    };
}

/** Strip meta-commentary the AI mistakenly put in message or action_required (e.g. "The user seems frustrated", "I need to...") */
export function sanitizeAiContent(text: string): string {
    if (!text?.trim()) return text;
    const metaPatterns = [
        /\bThe user seems? [^.]*\./gi,
        /\bI need to [^.]*\./gi,
        /\bI will [^.]*\./gi,
        /\bI should [^.]*\./gi,
        /\bI'm going to [^.]*\./gi,
        /\bthat this is the best approach\.?/gi,
        /\bI'll reiterate[^.]*\./gi,
        /\bLet me [^.]*\./gi,
        /\bI'll address [^.]*\./gi,
    ];
    let result = text;
    for (const p of metaPatterns) {
        result = result.replace(p, '').trim();
    }
    return result.replace(/\n{3,}/g, '\n\n').trim();
}
