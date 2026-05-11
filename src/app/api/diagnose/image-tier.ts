/**
 * Cheap multimodal pre-pass: decide whether uploaded photos are redundant views
 * of one issue or clearly different maintenance subjects.
 */

import { SchemaType } from '@google/generative-ai';
import { getGeminiModelNamed } from '@/lib/ai-client';

/** Override via env if Google renames or you want a different tiering model. */
export const DEFAULT_IMAGE_TIER_MODEL =
    (typeof process !== 'undefined' && process.env.IMAGE_TIER_GEMINI_MODEL?.trim()) ||
    'gemini-2.0-flash-lite';

export interface InlineImagePart {
    inlineData: { data: string; mimeType: string };
}

export interface ImageTierModelOutput {
    same_subject: boolean;
    primary_index: number;
    send_indices: number[];
    secondary_issue_detected: boolean;
    user_message_if_split: string;
}

export interface ImageTierResult {
    sendIndices: number[];
    secondaryIssueDetected: boolean;
    userMessageIfSplit: string;
    usedFallback: boolean;
}

const IMAGE_TIER_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        same_subject: {
            type: SchemaType.BOOLEAN,
            description:
                'True if all photos show the same maintenance subject or fault from different angles / redundancy.',
        },
        primary_index: {
            type: SchemaType.INTEGER,
            description: '0-based index of the single best photo for diagnosis (sharpness, fault visible).',
        },
        send_indices: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.INTEGER },
            description:
                '0-based indices to pass to the expensive diagnosis model, in ascending order, subset of inputs.',
        },
        secondary_issue_detected: {
            type: SchemaType.BOOLEAN,
            description:
                'True if photos clearly depict two or more unrelated home maintenance issues (e.g. gate motor and DB board).',
        },
        user_message_if_split: {
            type: SchemaType.STRING,
            description:
                'If secondary_issue_detected, a short user-facing question asking which issue to diagnose first. Otherwise empty.',
        },
    },
    required: [
        'same_subject',
        'primary_index',
        'send_indices',
        'secondary_issue_detected',
        'user_message_if_split',
    ],
};

const ALL_INDICES = (n: number) => Array.from({ length: n }, (_, i) => i);

function normalizeSendIndices(raw: unknown, len: number): number[] | null {
    if (!Array.isArray(raw) || len === 0) return null;
    const out: number[] = [];
    const seen = new Set<number>();
    for (const x of raw) {
        const i = typeof x === 'number' && Number.isInteger(x) ? x : parseInt(String(x), 10);
        if (!Number.isFinite(i) || i < 0 || i >= len || seen.has(i)) continue;
        seen.add(i);
        out.push(i);
    }
    out.sort((a, b) => a - b);
    return out.length > 0 ? out : null;
}

/**
 * Runs only when len >= 2. For len <= 1, callers should skip.
 */
export async function runImageTiering(parts: InlineImagePart[]): Promise<ImageTierResult> {
    const n = parts.length;
    if (n <= 1) {
        return {
            sendIndices: ALL_INDICES(n),
            secondaryIssueDetected: false,
            userMessageIfSplit: '',
            usedFallback: false,
        };
    }

    const fallback: ImageTierResult = {
        sendIndices: ALL_INDICES(n),
        secondaryIssueDetected: false,
        userMessageIfSplit: '',
        usedFallback: true,
    };

    try {
        const model = getGeminiModelNamed(DEFAULT_IMAGE_TIER_MODEL);
        const userParts = [
            ...parts.map((p) => ({ inlineData: p.inlineData })),
            {
                text: `You triage photos for a South African home maintenance diagnosis app.

There are exactly ${n} images in order (indices 0 to ${n - 1}).

Decide:
1) secondary_issue_detected: true ONLY if images clearly show two or more unrelated maintenance subjects or unrelated problem systems (not the same leak/pipe from two angles).
2) If secondary_issue_detected: set same_subject false, send_indices should list every index (we will ask the user to pick one issue before diagnosing), primary_index 0, and user_message_if_split: one short sentence asking which problem to diagnose first.
3) If NOT secondary_issue_detected and photos are redundant views of one issue: same_subject true, send_indices should usually be a single best index [primary_index] unless a second image clearly adds non-redundant detail (then at most two indices).
4) If NOT secondary_issue_detected but you are unsure: prefer sending all indices (send all ${n}) rather than dropping information.

Output JSON only matching the schema.`,
            },
        ];

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: userParts as any }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.7,
                topK: 20,
                maxOutputTokens: 220,
                responseMimeType: 'application/json',
                responseSchema: IMAGE_TIER_SCHEMA as any,
            },
        });

        const raw = result.response.text().trim();
        const parsed = JSON.parse(raw) as ImageTierModelOutput;

        const secondary = Boolean(parsed.secondary_issue_detected);
        const msg =
            typeof parsed.user_message_if_split === 'string' ? parsed.user_message_if_split.trim() : '';

        if (secondary) {
            return {
                sendIndices: ALL_INDICES(n),
                secondaryIssueDetected: true,
                userMessageIfSplit: msg,
                usedFallback: false,
            };
        }

        let sendIdx = normalizeSendIndices(parsed.send_indices, n);
        if (!sendIdx || sendIdx.length === 0) {
            const primary =
                typeof parsed.primary_index === 'number' && Number.isInteger(parsed.primary_index)
                    ? parsed.primary_index
                    : 0;
            const clamped = Math.max(0, Math.min(n - 1, primary));
            sendIdx = [clamped];
        }

        if (parsed.same_subject === true && sendIdx.length > n) {
            return fallback;
        }

        return {
            sendIndices: sendIdx,
            secondaryIssueDetected: false,
            userMessageIfSplit: '',
            usedFallback: false,
        };
    } catch {
        return fallback;
    }
}

export function pickImagePartsByIndices(parts: InlineImagePart[], indices: number[]): InlineImagePart[] {
    const out: InlineImagePart[] = [];
    for (const i of indices) {
        if (i >= 0 && i < parts.length) out.push(parts[i]!);
    }
    return out.length > 0 ? out : parts;
}
