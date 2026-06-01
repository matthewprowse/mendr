/**
 * The forgiving parser (Designing For Every User).
 *
 * Three layers, in order, whenever the bot expects a specific answer:
 *   1. Exact / obvious match — number, ordinal word, yes/no variants, option
 *      name, or a clear partial of it. Pure and synchronous.
 *   2. Cheap LLM intent mapping — gemini-2.5-flash constrained classification
 *      into the options already on screen, or "unclear". Injected so it can be
 *      stubbed in tests.
 *   3. Gentle re-prompt — handled by the caller when this returns 'unclear'.
 *
 * Also detects global commands (help, menu, start over, stop, talk to a person)
 * and yes/no, since these recur across states.
 *
 * THE ONE RULE: an unrecognised message must never wipe the session. This
 * module only ever *interprets*; it returns 'unclear' rather than failing.
 */

/** A selectable option presented to the user. */
export interface ParserOption {
    /** 1-based index shown to the user. */
    index: number;
    /** The option text. */
    text: string;
}

export type GlobalCommand =
    | 'help'
    | 'menu'
    | 'start_over'
    | 'stop'
    | 'human';

export type YesNo = 'yes' | 'no' | 'unclear';

/** Result of resolving a reply against a set of options. */
export type OptionResolution =
    | { kind: 'option'; index: number }
    | { kind: 'unclear' };

const ORDINALS: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    '1st': 1,
    '2nd': 2,
    '3rd': 3,
    '4th': 4,
    '5th': 5,
    '6th': 6,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
};

const YES_WORDS = new Set([
    'yes',
    'y',
    'yeah',
    'yep',
    'yip',
    'ya',
    'yea',
    'sure',
    'ok',
    'okay',
    'okey',
    'please',
    'yes please',
    'go ahead',
    'do it',
    'definitely',
    'absolutely',
    'correct',
    'affirmative',
    'continue',
    'ready',
]);

const NO_WORDS = new Set([
    'no',
    'n',
    'nope',
    'nah',
    'naa',
    'not now',
    'no thanks',
    'no thank you',
    'never mind',
    'nevermind',
    'cancel',
    'stop',
    'negative',
]);

function normalise(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detect a global command that bypasses the state machine. Returns null when
 * the reply is not a global command. "stop" is intentionally matched here even
 * though it also appears in NO_WORDS — global command detection runs first.
 */
export function detectGlobalCommand(textRaw: string): GlobalCommand | null {
    const t = normalise(textRaw);
    if (!t) return null;
    if (t === 'help' || t === 'h' || t === 'what can you do' || t === 'commands') {
        return 'help';
    }
    if (t === 'menu' || t === 'options') return 'menu';
    if (
        t === 'start over' ||
        t === 'startover' ||
        t === 'restart' ||
        t === 'start again' ||
        t === 'reset' ||
        t === 'new diagnosis'
    ) {
        return 'start_over';
    }
    if (t === 'stop' || t === 'quit' || t === 'exit' || t === 'end') return 'stop';
    if (
        t.includes('talk to a person') ||
        t.includes('talk to a human') ||
        t.includes('speak to a person') ||
        t.includes('speak to someone') ||
        t.includes('real person') ||
        t.includes('human') ||
        t === 'agent' ||
        t.includes('talk to someone')
    ) {
        return 'human';
    }
    return null;
}

/** Layer 1 yes/no detection. Returns 'unclear' when not an obvious yes/no. */
export function detectYesNo(textRaw: string): YesNo {
    const t = normalise(textRaw);
    if (!t) return 'unclear';
    if (YES_WORDS.has(t)) return 'yes';
    if (NO_WORDS.has(t)) return 'no';
    // Leading-token check for short replies like "yes please find them".
    const firstWord = t.split(' ')[0];
    if (YES_WORDS.has(firstWord)) return 'yes';
    if (NO_WORDS.has(firstWord)) return 'no';
    return 'unclear';
}

/**
 * Layer 1 option matching (exact / obvious). Returns the matched 1-based index
 * or null when no obvious match. Matches:
 *   - a bare number ("2")
 *   - an ordinal word ("the second one", "first")
 *   - "last" → the final option
 *   - the option text or a clear partial of it
 */
export function matchOptionExact(
    textRaw: string,
    options: ParserOption[],
): number | null {
    if (options.length === 0) return null;
    const t = normalise(textRaw);
    if (!t) return null;

    const words = t.split(' ');

    // Bare number anywhere as a standalone token.
    const numTokens = words.filter((w) => /^\d+$/.test(w));
    if (numTokens.length === 1) {
        const n = Number(numTokens[0]);
        if (options.some((o) => o.index === n)) return n;
    }

    // "last" → final option. Checked before ordinal words because "the last
    // one" also contains the cardinal "one".
    if (t === 'last' || t.includes('the last') || t.endsWith(' last')) {
        return options[options.length - 1].index;
    }

    // Ordinal / cardinal number words. These are noisy when embedded in a longer
    // sentence ("ya the heavy gate one"), so only honour them when the reply is
    // short and dominated by the ordinal — i.e. it is essentially just the
    // ordinal plus filler words like "the" / "one" / "option" / "please".
    const FILLER = new Set([
        'the',
        'option',
        'number',
        'no',
        'one',
        'please',
        'choice',
        'answer',
    ]);
    if (words.length <= 3) {
        for (const word of words) {
            const ord = ORDINALS[word];
            // Skip the bare cardinal "one" etc. unless it is the only meaningful
            // token (handled by the short-reply guard above).
            if (ord && options.some((o) => o.index === ord)) {
                const others = words.filter((w) => w !== word && !FILLER.has(w));
                if (others.length === 0) return ord;
            }
        }
    }

    // Exact option text match.
    for (const o of options) {
        if (normalise(o.text) === t) return o.index;
    }

    // Clear partial: the reply is contained in exactly one option, or exactly
    // one option is contained in the reply. Require a non-trivial length to
    // avoid matching stop-words.
    if (t.length >= 4) {
        const containing = options.filter((o) => {
            const ot = normalise(o.text);
            return ot.includes(t) || t.includes(ot);
        });
        if (containing.length === 1) return containing[0].index;
    }

    return null;
}

/**
 * Layer 2 intent classifier signature. Returns the 1-based option index it
 * believes the reply maps to, or null for "unclear". Injected so the parser
 * stays pure and testable; the real implementation lives in
 * `intent-classifier.ts`.
 */
export type IntentClassifier = (
    reply: string,
    options: ParserOption[],
) => Promise<number | null>;

/**
 * Resolve a reply to one of the options using all three layers (layer 3 is the
 * caller's re-prompt). Layer 2 is only invoked when layer 1 fails AND a
 * classifier is provided.
 */
export async function resolveOption(
    textRaw: string,
    options: ParserOption[],
    classifier?: IntentClassifier,
): Promise<OptionResolution> {
    const exact = matchOptionExact(textRaw, options);
    if (exact !== null) return { kind: 'option', index: exact };

    if (classifier) {
        try {
            const llm = await classifier(textRaw, options);
            if (llm !== null && options.some((o) => o.index === llm)) {
                return { kind: 'option', index: llm };
            }
        } catch (e) {
            console.warn('[whatsapp/parser] classifier error, falling back:', e);
        }
    }

    return { kind: 'unclear' };
}

/**
 * Resolve a yes/no with layer 2 backup. The classifier is given a synthetic
 * two-option set (1 = Yes, 2 = No) so the same constrained-classification
 * machinery applies.
 */
export async function resolveYesNo(
    textRaw: string,
    classifier?: IntentClassifier,
): Promise<YesNo> {
    const layer1 = detectYesNo(textRaw);
    if (layer1 !== 'unclear') return layer1;

    if (classifier) {
        const yn = await resolveOption(
            textRaw,
            [
                { index: 1, text: 'Yes' },
                { index: 2, text: 'No' },
            ],
            classifier,
        );
        if (yn.kind === 'option') return yn.index === 1 ? 'yes' : 'no';
    }
    return 'unclear';
}

/**
 * Heuristic: does this reply look like a question rather than an answer?
 * Used so the bot answers the question first, then re-asks (Questions Instead
 * Of Answers).
 */
export function looksLikeQuestion(textRaw: string): boolean {
    const t = textRaw.trim();
    if (t.endsWith('?')) return true;
    const lead = normalise(t).split(' ')[0];
    return [
        'what',
        'why',
        'how',
        'when',
        'where',
        'who',
        'do',
        'does',
        'can',
        'will',
        'is',
        'are',
        'should',
        'would',
        'must',
    ].includes(lead);
}

/**
 * Heuristic confusion / frustration signal: short blunt replies that signal the
 * user is lost, not issuing a command. Re-explain in simpler words, never
 * restart.
 */
export function looksConfusedOrFrustrated(textRaw: string): boolean {
    const t = normalise(textRaw);
    if (!t) return true; // empty / sticker-only
    if (
        t === 'what' ||
        t === 'huh' ||
        t === 'eh' ||
        t === 'idk' ||
        t === 'dunno' ||
        t.includes('dont understand') ||
        t.includes('do not understand') ||
        t.includes('confused') ||
        t.includes('this is wrong') ||
        t.includes('not right') ||
        t.includes('makes no sense')
    ) {
        return true;
    }
    // Punctuation-only confusion ("??", "?!") after normalisation is empty,
    // already caught above.
    return false;
}
