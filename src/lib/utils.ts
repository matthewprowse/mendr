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

/**
 * Format a business name for display: remove legal/marketing suffixes (Pty, Ltd, LLC, etc.),
 * replace " AND " with " & ", and apply title case.
 */
// Ordered longest-first so greedy matching prefers longer words
const WORD_DICT = new Set([
    'handyman', 'plumber', 'plumbing', 'electrician', 'electrical', 'electric',
    'painter', 'painting', 'builders', 'builder', 'building', 'construction',
    'renovations', 'renovation', 'roofing', 'roofer', 'tiling', 'tiler',
    'carpentry', 'carpenter', 'flooring', 'waterproofing', 'waterproof',
    'maintenance', 'services', 'service', 'solutions', 'solution',
    'professionals', 'professional', 'experts', 'expert', 'specialists', 'specialist',
    'contractors', 'contractor', 'installations', 'installation', 'install',
    'repairs', 'repair', 'direct', 'connect', 'pro', 'pros', 'home', 'house',
    'property', 'garden', 'gardening', 'landscaping', 'landscape', 'cleaning',
    'cleaner', 'cleaners', 'pest', 'control', 'solar', 'energy', 'pool',
    'pools', 'fencing', 'fence', 'gate', 'gates', 'security', 'alarm', 'alarms',
    'glass', 'glazing', 'glazier', 'welding', 'welder', 'steel', 'iron', 'metal',
    'concrete', 'paving', 'paver', 'drains', 'drain', 'drainage', 'gutter', 'gutters',
    'aircon', 'hvac', 'heating', 'cooling', 'insulation', 'ceiling', 'ceilings',
    'kitchen', 'bathroom', 'bedrooms', 'bedroom', 'office', 'commercial',
    'residential', 'industrial', 'cape', 'town', 'west', 'south', 'north', 'east',
    'central', 'city', 'group', 'team', 'works', 'work', 'fix', 'care', 'easy',
    'fast', 'quick', 'smart', 'top', 'best', 'premier', 'elite', 'quality',
    'affordable', 'budget', 'value', 'local', 'national', 'global',
]);

/**
 * Greedily split a single all-alpha token into known words using the dictionary.
 * Falls back to returning the original token if no split is found.
 */
function splitConcatenated(token: string): string[] {
    const lower = token.toLowerCase();
    const n = lower.length;
    // dp[i] = array of words that cover lower[0..i-1], or null if no solution
    const dp: (string[] | null)[] = Array(n + 1).fill(null);
    dp[0] = [];

    for (let i = 0; i < n; i++) {
        if (dp[i] === null) continue;
        for (let j = i + 2; j <= n; j++) {
            const slice = lower.slice(i, j);
            if (WORD_DICT.has(slice)) {
                if (dp[j] === null) {
                    dp[j] = [...dp[i]!, slice];
                }
            }
        }
    }

    return dp[n] ?? [token];
}

// Location words/phrases that are stripped from the end of business names
const LOCATION_SUFFIXES = [
    // Full phrases first (longest match wins — order matters)
    'western cape', 'south africa', 'cape town', 'cape peninsula', 'cape winelands',
    'garden route', 'greater cape town',
    // Single location words
    'johannesburg', 'pretoria', 'durban', 'stellenbosch', 'paarl', 'george',
    'bellville', 'tygervalley', 'brackenfell', 'mitchells plain', 'khayelitsha',
    'somerset west', 'gordons bay', 'strand', 'hermanus', 'worcester',
    'northern suburbs', 'southern suburbs', 'atlantic seaboard',
    'gauteng', 'kwazulu', 'natal', 'limpopo', 'mpumalanga',
];

// Trailing noise words stripped from the end of a name (after location stripping).
// Do not include 'automations' or 'automation' — they are often part of the business name (e.g. Planet Automations).
const TRAILING_NOISE = [
    'new', 'technologies', 'technology',
    'digital', 'online', 'nationwide', 'sa',
];

// Words that commonly appear in marketing tag lists after " - " or " | " (e.g. "Al Garage Door Solutions - New | Repairs | Automations")
const TAG_SUFFIX_WORDS = new Set([
    'new', 'repairs', 'repair', 'sales', 'installations', 'installation', 'upgrades', 'upgrade',
    'automations', 'automation',
    'maintenance', 'open', 'emergency', 'same', 'day', 'quality', 'service', 'professional',
    'residential', 'commercial', 'free', 'quote', 'quotes', 'best', 'price', 'prices',
    'guaranteed', 'licensed', 'insured', 'bonded', 'available', 'now', 'call', 'us',
    '24', 'hours', '24/7', '247', 'same-day', 'sameday',
]);

function stripTagSuffix(s: string): string {
    let t = s.replace(/\s*\|?\s*[-–—]?\s*$/g, '').trim();
    const dashPipe = /\s+[-|–—]\s+/;
    const idx = t.search(dashPipe);
    if (idx === -1) return t;
    const afterDelim = t.slice(idx).replace(/^\s*[-|–—]\s*/, '');
    const tokens = afterDelim
        .split(/\s*\|\s*/)
        .flatMap((part) => part.split(/\s+/))
        .map((x) => x.toLowerCase().replace(/[^a-z0-9\/]/g, ''))
        .filter(Boolean);
    const allTags = tokens.length > 0 && tokens.every((tok) => TAG_SUFFIX_WORDS.has(tok) || /^\d+\/?\d*$/.test(tok));
    if (allTags) return t.slice(0, idx).trim();
    return t;
}

export function formatBusinessName(name: string | undefined | null): string {
    if (!name?.trim()) return '';
    let s = name.trim();
    // Strip " - New | Repairs |" style tag/marketing suffixes first
    s = stripTagSuffix(s);
    // Remove common legal/marketing suffixes
    s = s
        .replace(/,?\s*\(?\s*Pty\.?\s*\)?\s*Ltd\.?\s*$/gi, '')
        .replace(/,?\s*Pty\.?\s*Ltd\.?\s*$/gi, '')
        .replace(/,?\s*Ltd\.?\s*$/gi, '')
        .replace(/,?\s*LLC\.?\s*$/gi, '')
        .replace(/,?\s*Inc\.?\s*$/gi, '')
        .replace(/,?\s*Co\.?\s*$/gi, '')
        .replace(/,?\s*\(?\s*Pty\.?\s*\)?\s*$/gi, '')
        .replace(/,?\s*Pty\.?\s*$/gi, '')
        .trim();
    // Strip domain-style suffixes (e.g. ".co.za", ".com", ".net")
    s = s.replace(/\.(co\.za|com|net|org|biz|info|co)$/gi, '').trim();
    // Replace " AND " with " & "
    s = s.replace(/\s+and\s+/gi, ' & ');
    // Strip trailing location suffixes — longest first, case-insensitive
    // Keep stripping until no more match (handles "Repairs Cape Town Western Cape")
    let changed = true;
    while (changed) {
        changed = false;
        for (const loc of LOCATION_SUFFIXES) {
            const re = new RegExp(`,?\\s*[-–—]?\\s*${loc.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
            const stripped = s.replace(re, '').trim();
            if (stripped && stripped !== s) {
                s = stripped;
                changed = true;
                break; // restart after each match
            }
        }
    }
    // Strip trailing noise words (only when they don't constitute the full name)
    for (const noise of TRAILING_NOISE) {
        const re = new RegExp(`\\s+${noise}\\s*$`, 'i');
        const stripped = s.replace(re, '').trim();
        if (stripped.length > 0) s = stripped;
    }

    const titleWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

    s = s
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word) => {
            if (word === '&') return [word];
            // Handle hyphenated compounds: title-case each segment, attempt word-split within each
            if (word.includes('-')) {
                return [
                    word
                        .split('-')
                        .flatMap((part) =>
                            /^[a-z]+$/i.test(part) ? splitConcatenated(part) : [part]
                        )
                        .map(titleWord)
                        .join('-'),
                ];
            }
            // Attempt to split concatenated all-alpha tokens
            if (/^[a-z]+$/i.test(word)) {
                return splitConcatenated(word).map(titleWord);
            }
            return [titleWord(word)];
        })
        .join(' ');
    // Remove any trailing delimiter junk left after stripping (e.g. " - " or " | ")
    return s.replace(/\s*[-|–—]\s*$/, '').trim();
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
