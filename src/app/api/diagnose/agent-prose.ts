/**
 * Agent 2b — Prose generation sub-agent.
 *
 * Receives the locked-in classification from Agent 2a and generates only the
 * narrative fields: thought, diagnosis title, message, action_required,
 * estimated_cost, image_descriptions.
 *
 * Benefits of separating prose from classification:
 *   - The prose model is never distracted by needing to classify.
 *   - Classification results are injected as ground truth so the prose model
 *     cannot contradict them (prevents trade drift on follow-ups).
 *   - The `thought` field is the FIRST key in the schema so Gemini outputs it
 *     first during streaming, giving the user a fast preview.
 *   - Each head (classify / prose) can be fine-tuned independently.
 */

import { SchemaType } from '@google/generative-ai';
import type { Content as GeminiContent } from '@google/generative-ai';
import { getDiagnosisModel } from '@/lib/ai-diagnosis-backend';
import { toHeadlineStyle, stripFillerSentenceStarts } from '@/lib/prompt-utils';
import type { ClassificationResult } from './agent-classify';

// ── Output type ────────────────────────────────────────────────────────────────

export interface ProseResult {
    thought: string;
    diagnosis: string;
    estimated_diagnosis_sentence: string;
    message: string;
    action_required: string;
    estimated_cost: string;
    /** Consumer-friendly one-sentence translation of urgency_key for the homeowner. */
    urgency_sentence: string;
    /** Predicted invoice line-item names, e.g. ["Call-out fee", "Capacitor replacement"]. */
    expected_parts: string[];
    image_descriptions: string[];
    /**
     * Only populated when requires_clarification is true.
     * 2–4 short clarifying statements phrased from the USER's perspective
     * (e.g. "It's a gas geyser", "The leak started after heavy rain").
     * These are surfaced as quick-reply chips in the UI.
     */
    clarification_questions?: string[];
    /** True when the prose Gemini call / JSON parse failed. */
    requestFailed?: boolean;
}

// ── JSON schema (Gemini structured output) ─────────────────────────────────────
// `thought` is declared FIRST so Gemini streams it before longer fields.

const PROSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        thought: {
            type: SchemaType.STRING,
            description:
                '2–3 conversational, telegraphic sentences. Anchor each concrete claim in direct visual evidence from the photo (specific parts, gaps, position, wear, stains, deformation). You may open with the user\'s own words or a short empathetic hook. Cover: (1) what the image actually shows, (2) the likely fault tied to that evidence, (3) optional mechanism. Do NOT use generic textbook padding ("common point of failure", "often fails here", "typical weak spot"). At least 125 characters total. No actions, no specialists, no next steps.',
        },
        diagnosis: {
            type: SchemaType.STRING,
            description:
                'Diagnosis title. Plain language. Max 75 characters and max 7 words. Headline-Style Title Case. No commas, colons, slashes, jargon, or conjunctions like or/and. Pick the single most likely cause.',
        },
        estimated_diagnosis_sentence: {
            type: SchemaType.STRING,
            description: 'Same text as the diagnosis field — identical.',
        },
        message: {
            type: SchemaType.STRING,
            description:
                '2–3 paragraphs separated by \\n\\n, following MESSAGE RULES. Paragraph 1: teaching diagnosis (causal chain, no alarm words). Paragraph 2: what happens next from the homeowner\'s perspective — what the technician will check or do, what a typical job looks like, how disruptive it will be. Paragraph 3 (optional): only if a genuinely non-obvious hazard exists. No headings, meta-commentary, or em dashes.',
        },
        action_required: {
            type: SchemaType.STRING,
            description:
                '2–4 sentences in "Your technician will…" or "Specialists will…" voice per ACTION_REQUIRED RULES. State sequence when order matters. No trade label name. No imperative commands — write for the homeowner reading this, not for the tradesperson.',
        },
        estimated_cost: {
            type: SchemaType.STRING,
            description:
                'One or two short sentences. South African Rand (R). Spaced thousands (R1 200–R3 500). Western Cape homeowner ballpark. Empty string when rejected/unserviced/requires_clarification.',
        },
        urgency_sentence: {
            type: SchemaType.STRING,
            description:
                'One plain-English sentence consistent with the locked urgency_key and severity rubric (immediate = same-day safety or active harm risk; urgent = book within days; soon = inconvenience / workaround exists; planned = cosmetic or routine). No jargon. Do not claim "spreading" damage for static mechanical faults. Empty string when requires_clarification, rejected, or unserviced.',
        },
        expected_parts: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'A short invoice line-item name in plain language, e.g. "Call-out fee", "Capacitor replacement", "Labour (1–2 hours)".',
            },
            description:
                '2–5 predicted invoice line items for this repair. Empty array when requires_clarification, rejected, or unserviced.',
        },
        image_descriptions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'One entry per image: max 2 plain-language sentences of pure visual observation — what the camera shows (parts, position, condition) and what appears wrong. Be specific, not generic. Distinct from thought: no textbook statistics, no "common failure point" filler, no causal chain beyond what is visibly implied.',
            },
            description: 'One pure visual description per image provided.',
        },
        clarification_questions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'A short statement the homeowner taps to confirm — phrased in their own words, describing a symptom or context they can observe. Max 8 words. Must be mutually exclusive with the other chips in this array.',
            },
            description:
                'Only populate when requires_clarification is true. Exactly 3–4 chips covering the single most important unknown that would change the diagnosis. Options must be mutually exclusive and collectively exhaustive — the last chip is always a catch-all (e.g. "Something else is happening."). Empty array when requires_clarification is false.',
        },
    },
    required: [
        'thought',
        'diagnosis',
        'estimated_diagnosis_sentence',
        'message',
        'action_required',
        'estimated_cost',
        'urgency_sentence',
        'expected_parts',
        'image_descriptions',
        'clarification_questions',
    ],
};

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildProseSystemPrompt(
    classification: ClassificationResult,
    baseSystemInstruction: string,
): string {
    const classBlock = `CLASSIFICATION — LOCKED IN (do NOT override these fields):
subcategory_id: ${classification.subcategory_id}
trade: ${classification.trade}
trade_detail: ${classification.trade_detail || '(none)'}
urgency_key: ${classification.urgency_key}
confidence: ${classification.confidence}
rejected: ${classification.rejected}
requires_clarification: ${classification.requires_clarification}
unserviced: ${classification.unserviced}
refetch_providers: ${classification.refetch_providers}
${classification.unsupported_reason ? `unsupported_reason: ${classification.unsupported_reason}` : ''}

YOUR ONLY JOB: write the prose fields (thought, diagnosis, message, action_required, estimated_cost, image_descriptions).
Accept the classification above as ground truth. Do not re-classify. Do not change trade or urgency.

DIAGNOSIS TITLE RULE: When trade_detail is not "(none)", diagnosis and estimated_diagnosis_sentence MUST describe the SAME fault / equipment as trade_detail — same plain meaning, concise headline (stay within diagnosis length limits).

${classification.rejected || classification.unserviced
    ? 'Because rejected or unserviced is true: set estimated_cost to empty string. Keep message warm and helpful. Explain what Scandio does offer.'
    : ''}
${classification.requires_clarification && !classification.rejected
    ? 'Because requires_clarification is true: ask a targeted follow-up question in message. Keep action_required and estimated_cost minimal.'
    : ''}`;

    const clarificationBlock = classification.requires_clarification && !classification.rejected
        ? `CLARIFICATION QUESTIONS (required because requires_clarification is true):
Identify the SINGLE most important unknown — the one piece of information that, if answered, would most change the diagnosis.
Generate exactly 3–4 chips around that one unknown. Rules:
1. Each chip is a short statement the homeowner taps to confirm (max 8 words). Written in plain language they use, not technical terms.
2. Do NOT ask about anything already visible in the photo or already stated in the user's message.
3. Options must be mutually exclusive — no two chips should describe the same scenario.
4. The last chip is always a catch-all, e.g. "Something else is happening."
5. Focus on observable symptoms or context (what they see, hear, or when it happens) — not technical diagnoses.
Good examples: "It started after heavy rain.", "The breaker trips when this runs.", "It only happens in one room.", "Something else is happening."
Bad examples (too long, technical, or generic): "The fault is in the PCB board.", "There are multiple possible causes.", "I am not sure what the problem is."`
        : `Leave clarification_questions as an empty array (requires_clarification is false).`;

    const visualAndUrgencyBlock =
        classification.rejected || classification.unserviced
            ? ''
            : `
VISUAL ANCHORING (Agent 2b — thought, image_descriptions, and teaching paragraphs when a photo is in play):
- Ground every concrete diagnostic claim in what is actually visible: parts, gaps, height misalignment, stains, deformation, exposed conductors, fluid, corrosion, mounting, burn marks, etc. Say what the camera shows, then tie the fault to that evidence.
- Do NOT pad with generic encyclopaedic filler: avoid "common point of failure", "often fails here", "typical weak spot", "many homeowners see this", or statistical generalities unless the user asked for prevalence.
- Do NOT use progressive-damage wording ("before the fault spreads", "could spread", "might spread") unless the issue is genuinely progressive (active flooding, worsening leak, runaway electrical fault, fire risk). Static mechanical faults (misaligned rack, worn nylon teeth, noisy hinge) do not "spread" like mould or water.
- Multi-image requirement: explicitly account for each image. If one image shows direct component failure (missing spring, bent rod, fractured bracket, detached hinge), that component-level evidence must be reflected in thought/image_descriptions and should outweigh weaker incidental cues.
- Conflict handling: when two images appear to point at different causes, prioritise the cause supported by direct mechanical/electrical damage and acknowledge uncertainty in message rather than confidently selecting a cosmetic or secondary cue.

URGENCY_SENTENCE (must match locked urgency_key):
- immediate: same-day framing only when life-safety, active harm, or serious property risk truly applies.
- urgent: book within a few days; system down or risk of equipment damage if neglected — not life-safety hyperbole.
- soon / planned: calmer booking guidance; mention manual override or safe workaround when relevant (e.g. gate can be moved manually, motor isolated).
- Never label a routine mechanical fault as an emergency unless urgency_key is immediate for rubric reasons above.`.trim();

    const parts = [baseSystemInstruction, classBlock, clarificationBlock, visualAndUrgencyBlock].filter(
        (s) => s && s.trim().length > 0,
    );
    return parts.join('\n\n');
}

// ── Public API ─────────────────────────────────────────────────────────────────

const FALLBACK_PROSE: ProseResult = {
    thought:
        'Something about this image is not clear enough for a confident diagnosis. Uploading a sharper or closer photo of the problem area will help.',
    diagnosis: 'Unclear — More Detail Needed',
    estimated_diagnosis_sentence: 'Unclear — More Detail Needed',
    message:
        'This image is not clear enough to give a confident diagnosis. Please try uploading a closer, sharper photo of the problem area, or describe the issue in more detail below.',
    action_required: 'Specialists can assess the issue on-site once the fault is identified.',
    estimated_cost: '',
    urgency_sentence: '',
    expected_parts: [],
    image_descriptions: [],
    clarification_questions: [],
};

/**
 * Run the prose generation sub-agent (Agent 2b).
 *
 * Receives the classification result from Agent 2a as locked ground truth.
 * Uses Gemini structured output with `thought` as the first schema key so
 * it streams immediately.
 */
export async function runProseGeneration(params: {
    contents: GeminiContent[];
    classification: ClassificationResult;
    baseSystemInstruction: string;
    isProviderHydration?: boolean;
}): Promise<ProseResult> {
    try {
        const model = getDiagnosisModel();

        const systemPrompt = buildProseSystemPrompt(
            params.classification,
            params.baseSystemInstruction,
        );

        const proseContents: GeminiContent[] = [
            {
                role: 'user' as const,
                parts: [{ text: systemPrompt }],
            },
            ...params.contents,
            {
                role: 'user' as const,
                parts: [
                    {
                        text:
                            'Write the prose fields for the home maintenance issue above. Use British English. Output structured JSON only.',
                    },
                ],
            },
        ];

        const result = await model.generateContent({
            contents: proseContents,
            generationConfig: {
                temperature: params.isProviderHydration ? 0.22 : 0.35,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1800,
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: PROSE_SCHEMA as any,
            },
        });

        let raw: string;
        try {
            raw = result.response.text().trim();
        } catch (texErr) {
            console.error('[agent-prose] response.text() failed', texErr);
            return { ...FALLBACK_PROSE, requestFailed: true };
        }

        if (!raw) {
            console.error('[agent-prose] empty model text', {
                cand: result.response.candidates?.length ?? 0,
            });
            return { ...FALLBACK_PROSE, requestFailed: true };
        }

        let parsed: ProseResult;
        try {
            parsed = JSON.parse(raw) as ProseResult;
        } catch {
            console.error('[agent-prose] JSON.parse failed', raw.slice(0, 600));
            return { ...FALLBACK_PROSE, requestFailed: true };
        }

        // Guarantee thought meets minimum length
        if (!parsed.thought || parsed.thought.trim().length < 50) {
            parsed.thought = FALLBACK_PROSE.thought;
        }

        // Guarantee image_descriptions is an array
        if (!Array.isArray(parsed.image_descriptions)) {
            parsed.image_descriptions = [];
        }
        if (!Array.isArray(parsed.clarification_questions)) {
            parsed.clarification_questions = [];
        }

        return parsed;
    } catch (e) {
        console.error('[agent-prose] generateContent threw', e);
        return { ...FALLBACK_PROSE, requestFailed: true };
    }
}

/**
 * Normalise prose result fields to match the style rules enforced by
 * the legacy post-processing pipeline (toHeadlineStyle, stripFillerSentenceStarts).
 * Keeps parity with old single-agent behaviour without regex on raw model text.
 */
export function normaliseProse(prose: ProseResult): ProseResult {
    return {
        ...prose,
        diagnosis: toHeadlineStyle(prose.diagnosis),
        estimated_diagnosis_sentence: toHeadlineStyle(
            prose.estimated_diagnosis_sentence || prose.diagnosis,
        ),
        trade_detail: undefined, // not prose's field
        action_required: stripFillerSentenceStarts(prose.action_required),
        ...(prose.requestFailed ? { requestFailed: true as const } : {}),
    } as ProseResult;
}
