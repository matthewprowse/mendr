/**
 * Agent 2b — Prose generation sub-agent.
 *
 * Receives the locked-in classification from Agent 2a and generates only the
 * narrative fields: thought, diagnosis title, message, action_required,
 * image_descriptions.
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
import { getDiagnosisModel, GEMINI_MODEL_NAME } from '@/lib/ai/ai-diagnosis-backend';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import { toHeadlineStyle, stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';

// ── Output type ────────────────────────────────────────────────────────────────

export type ImageObservationRole =
    | 'primary_evidence'
    | 'corroborating'
    | 'contradicting'
    | 'context_only';

export interface ImageObservation {
    primary_observation: string;
    components_visible: string[];
    components_missing_or_damaged: string[];
    role_in_diagnosis: ImageObservationRole;
}

export interface ProseResult {
    thought: string;
    diagnosis: string;
    estimated_diagnosis_sentence: string;
    message: string;
    action_required: string;
    contractor_checklist: string[];
    homeowner_prep: string;
    image_descriptions: string[];
    image_observations: ImageObservation[];
    diy_verification: string;
    photo_request: string;
    confidence_drivers: string[];
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
                'A 4-6 sentence reasoning trace showing how you arrived at the diagnosis, 400-700 characters total. Structure: (1) what each image actually shows in plain language, (2) what specific component appears to have failed, (3) any cascading or secondary effects of that failure, (4) why this conclusion fits the visible evidence better than alternatives. This is the homeowner-facing "How I worked this out" section — they read it to assess whether to trust the diagnosis. No em dashes. No mention of contacting specialists or next steps. Start each sentence with a capital letter.',
        },
        diagnosis: {
            type: SchemaType.STRING,
            description:
                'Diagnosis title. Plain language. Max 75 characters and max 7 words. Headline-Style Title Case. No commas, colons, slashes, jargon, or conjunctions like or/and. Pick the single most likely cause.',
        },
        message: {
            type: SchemaType.STRING,
            description:
                '1–2 paragraphs separated by \\n\\n. Paragraph 1 (required): teaching diagnosis — explain the causal chain in plain language anchored in what the photo shows. No alarm words, no em dashes, no meta-commentary. Paragraph 2 (optional): only if a genuinely non-obvious hazard exists that the homeowner must act on before the contractor arrives. Do not describe what the contractor will do — that is covered in contractor_checklist.',
        },
        action_required: {
            type: SchemaType.STRING,
            description:
                'Deprecated — leave as an empty string. All contractor and homeowner guidance is now in contractor_checklist and homeowner_prep.',
        },
        contractor_checklist: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'A complete sentence starting with a verb, describing one specific thing the contractor will inspect, test, or replace. Ends with a full stop. No em dashes.',
            },
            description:
                '2–4 full sentences describing what the contractor will concretely do on-site. Each sentence starts with a verb and ends with a full stop. Specific to the diagnosed fault — no generic entries like "Assess the problem." or "Provide a quote." British English. No em dashes. Empty array when requires_clarification or rejected is true.',
        },
        homeowner_prep: {
            type: SchemaType.STRING,
            description:
                'One complete sentence: the single most practical thing the homeowner can do before the contractor arrives. Specific to this fault — for example: switch the geyser circuit breaker off at the DB board, isolate the water supply at the mains, clear access to the distribution board, note the error code shown on the display. Ends with a full stop. Return an empty string if nothing genuinely useful applies. No em dashes.',
        },
        image_descriptions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'One entry per image: max 2 plain-language sentences of pure visual observation — name the specific components visible and their condition. Critically: note any component that is MISSING, detached, absent, or asymmetric (e.g. spring present on one side but not the other, bent rod, displaced bracket). Be specific, not generic. No causal chain beyond what is directly visible.',
            },
            description: 'Exactly one entry per image provided, in order. Count must match the number of images submitted.',
        },
        image_observations: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    primary_observation: {
                        type: SchemaType.STRING,
                        description:
                            'The single most diagnostically significant thing visible in this image, in 5-20 words. Be specific — name the component, condition, and any visible damage or absence. Bad: "a garage door". Good: "left torsion spring is missing from its bracket; the right one is intact and seated correctly".',
                    },
                    components_visible: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.STRING },
                        description:
                            'Specific named components the camera clearly shows in this image. Each entry is one named part — for example "right torsion spring", "ceiling-mounted rail", "DB board main breaker", "pressure relief valve". Empty array only when nothing identifiable is visible.',
                    },
                    components_missing_or_damaged: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.STRING },
                        description:
                            'Specific named components that are MISSING, detached, asymmetric, deformed, burnt, or otherwise damaged in this image. Each entry includes the nature of the issue — for example "left torsion spring (absent, only bracket remains)", "connecting rod (bent at midpoint)", "thermostat housing (scorched on lower edge)". Empty array when nothing is visibly damaged or missing.',
                    },
                    role_in_diagnosis: {
                        type: SchemaType.STRING,
                        description:
                            'How this image relates to the overall diagnosis. Exactly one of: "primary_evidence" (this image is the strongest direct evidence of the fault — pick exactly one image as primary), "corroborating" (this image supports the primary observation), "contradicting" (this image points to a different cause than the primary; you MUST acknowledge the conflict in `thought` and lower confidence), or "context_only" (this image provides background context but no direct fault evidence).',
                    },
                },
                required: [
                    'primary_observation',
                    'components_visible',
                    'components_missing_or_damaged',
                    'role_in_diagnosis',
                ],
            },
            description:
                'EXACTLY one entry per image submitted, in input order. Exactly one entry must have role_in_diagnosis === "primary_evidence" when at least one image was submitted. Empty array when no images were submitted.',
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
        diy_verification: {
            type: SchemaType.STRING,
            description:
                'One sentence describing how the homeowner can themselves verify the diagnosis is correct, without tools and without risk. Must be specific to the diagnosed fault — for example "With the motor disengaged, lift the door by hand; if it stays balanced halfway up the spring tension is fine." or "Place a dry sheet of paper under the joint overnight; a wet patch confirms an active leak." Empty string only when no safe verification exists.',
        },
        photo_request: {
            type: SchemaType.STRING,
            description:
                'When zero images were provided or when an additional photo would meaningfully improve the diagnosis, specify exactly what photo would help. Be specific about the angle and what should be visible — for example "A photo of the underside of the geyser showing the pressure relief valve and any drip tray would let me confirm whether the leak is from the valve or the tank." Empty string when no additional photo would help.',
        },
        confidence_drivers: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
                description:
                    'One short phrase (not a sentence) naming one specific observation that drove the confidence level — either supporting evidence or a limiting factor.',
            },
            description:
                '2-4 short bullets naming the specific observations that drove the confidence level — both supporting evidence and any limiting factors. Examples: "Clear view of broken spring bracket", "Photo angle obscures opposite side", "Description matches the visible damage", "No image of the affected area". Each entry is one short phrase, not a sentence.',
        },
    },
    required: [
        'thought',
        'diagnosis',
        'message',
        'action_required',
        'contractor_checklist',
        'homeowner_prep',
        'image_descriptions',
        'image_observations',
        'clarification_questions',
        'diy_verification',
        'photo_request',
        'confidence_drivers',
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
confidence: ${classification.confidence}
rejected: ${classification.rejected}
requires_clarification: ${classification.requires_clarification}
unserviced: ${classification.unserviced}
refetch_providers: ${classification.refetch_providers}
${classification.unsupported_reason ? `unsupported_reason: ${classification.unsupported_reason}` : ''}

YOUR ONLY JOB: write the prose fields (thought, diagnosis, message, action_required, contractor_checklist, homeowner_prep, image_descriptions, image_observations, diy_verification, photo_request, confidence_drivers). No em dashes anywhere in any field.
Accept the classification above as ground truth. Do not re-classify. Do not change trade.

DIAGNOSIS TITLE RULE: When trade_detail is not "(none)", diagnosis and estimated_diagnosis_sentence MUST describe the SAME fault / equipment as trade_detail — same plain meaning, concise headline (stay within diagnosis length limits).

${classification.rejected || classification.unserviced
    ? 'Because rejected or unserviced is true: keep message warm and helpful. Explain what Mendr does offer.'
    : ''}
${classification.requires_clarification && !classification.rejected
    ? 'Because requires_clarification is true: ask a targeted follow-up question in message. Keep action_required minimal.'
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
- Do NOT use progressive-damage wording ("before the fault spreads", "could spread", "might spread") unless the issue is genuinely progressive. Static mechanical faults do not "spread" like mould or water.

MULTI-IMAGE SYNTHESIS PROTOCOL (apply when more than one image is provided):
1. Treat the full image set as a SINGLE combined evidence base, not as separate scenes to summarise independently.
2. The FIRST image in the input has been positioned by the user as their primary view. Weight it accordingly.
3. Before committing to a diagnosis: mentally identify the single image that shows the clearest direct mechanical or electrical fault. Anchor the diagnosis to that image.
4. Use the remaining images to corroborate, qualify, or contradict the primary observation. They are not licence to introduce additional unrelated faults.
5. ABSENCE DETECTION: compare symmetric features across images. A component absent on one side when symmetry is expected (e.g. a torsion spring present on one side but missing on the other, a hinge, a cable, a roller) is a primary fault signal — name it explicitly in image_descriptions and in thought.
6. CONFLICT HANDLING: when two images appear to point at different causes, do NOT silently pick one. Name the conflict explicitly in \`thought\`, prioritise the cause supported by direct mechanical or electrical damage, and lower confidence rather than committing confidently.
7. image_descriptions must contain EXACTLY one entry per image in input order. Each entry must call out any component that is MISSING, detached, asymmetric, or deformed.

CROSS-IMAGE OBSERVATION TABLE (mandatory pre-output discipline when any images are present):
Before you commit to the diagnosis fields, internally enumerate each image:
  Image 1: what does it show? what components are visible? what is missing / damaged / asymmetric?
  Image 2: same enumeration.
  Image 3: same enumeration.
  Image 4: same enumeration.
Then choose which single image is the PRIMARY EVIDENCE — the image showing the most direct fault. Mark it \`primary_evidence\` in image_observations. Mark the others as \`corroborating\`, \`contradicting\`, or \`context_only\` based on whether they support, conflict with, or merely contextualise the primary evidence.
If two images point to genuinely different causes, mark the second one \`contradicting\`, explicitly name the conflict in \`thought\`, and lower confidence accordingly — do NOT silently pick a winner.
The image_observations array MUST contain exactly one entry per image submitted, in submission order, with exactly one entry tagged \`primary_evidence\` whenever at least one image is present.`.trim();

    const parts = [baseSystemInstruction, classBlock, clarificationBlock, visualAndUrgencyBlock].filter(
        (s) => s && s.trim().length > 0,
    );
    return parts.join('\n\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_IMAGE_OBSERVATION_ROLES: ReadonlyArray<ImageObservationRole> = [
    'primary_evidence',
    'corroborating',
    'contradicting',
    'context_only',
];

/**
 * Validate and coerce the raw image_observations array produced by the model
 * into a strictly-typed ImageObservation[]. Unknown role values are coerced
 * to "context_only". Non-array input becomes []. Missing or wrong-typed
 * fields inside each entry are coerced to safe defaults.
 */
export function normaliseImageObservations(raw: unknown): ImageObservation[] {
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[])
        .filter((entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
        .map((entry): ImageObservation => {
            const primary =
                typeof entry.primary_observation === 'string'
                    ? entry.primary_observation
                    : '';
            const visible = Array.isArray(entry.components_visible)
                ? (entry.components_visible as unknown[]).filter(
                      (s): s is string => typeof s === 'string',
                  )
                : [];
            const missing = Array.isArray(entry.components_missing_or_damaged)
                ? (entry.components_missing_or_damaged as unknown[]).filter(
                      (s): s is string => typeof s === 'string',
                  )
                : [];
            const role =
                typeof entry.role_in_diagnosis === 'string' &&
                (VALID_IMAGE_OBSERVATION_ROLES as ReadonlyArray<string>).includes(
                    entry.role_in_diagnosis,
                )
                    ? (entry.role_in_diagnosis as ImageObservationRole)
                    : 'context_only';
            return {
                primary_observation: primary,
                components_visible: visible,
                components_missing_or_damaged: missing,
                role_in_diagnosis: role,
            };
        });
}

/**
 * Parse + validate a raw Gemini JSON response into a ProseResult.
 *
 * The parser/validator boundary used by `runProseGeneration`. Pulled out as a
 * pure function so it can be fixture-tested against well-formed, malformed,
 * empty, and refusal model outputs without mocking the Gemini SDK.
 *
 * Behaviour:
 *   - Empty/whitespace input → null (caller treats as requestFailed)
 *   - Invalid JSON → null
 *   - Non-object JSON (e.g. an array, a string literal) → null
 *   - Valid object → coerces all expected fields (arrays defaulted to []
 *     when missing, strings defaulted to ''), normalises image_observations,
 *     derives image_descriptions when missing, and enforces the minimum
 *     thought length by substituting the fallback when too short.
 */
export function parseProseResponse(raw: string): ProseResult | null {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) return null;
    let parsed: ProseResult;
    try {
        parsed = JSON.parse(trimmed) as ProseResult;
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
    }

    // Guarantee thought meets minimum length
    if (!parsed.thought || parsed.thought.trim().length < 200) {
        parsed.thought = FALLBACK_PROSE.thought;
    }

    // Guarantee array fields
    if (!Array.isArray(parsed.image_descriptions)) {
        parsed.image_descriptions = [];
    }
    if (!Array.isArray(parsed.clarification_questions)) {
        parsed.clarification_questions = [];
    }
    if (!Array.isArray(parsed.contractor_checklist)) {
        parsed.contractor_checklist = [];
    }
    if (typeof parsed.homeowner_prep !== 'string') {
        parsed.homeowner_prep = '';
    }
    if (typeof parsed.diy_verification !== 'string') {
        parsed.diy_verification = '';
    }
    if (typeof parsed.photo_request !== 'string') {
        parsed.photo_request = '';
    }
    if (!Array.isArray(parsed.confidence_drivers)) {
        parsed.confidence_drivers = [];
    }

    // Validate image_observations and derive image_descriptions when missing.
    parsed.image_observations = normaliseImageObservations(
        (parsed as { image_observations?: unknown }).image_observations,
    );
    if (
        (!parsed.image_descriptions || parsed.image_descriptions.length === 0) &&
        parsed.image_observations.length > 0
    ) {
        parsed.image_descriptions = parsed.image_observations
            .map((o) => o.primary_observation)
            .filter((s) => typeof s === 'string' && s.trim().length > 0);
    }

    return parsed;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const FALLBACK_PROSE: ProseResult = {
    thought:
        'Something about this image is not clear enough for a confident diagnosis. Uploading a sharper or closer photo of the problem area will help.',
    diagnosis: 'Unclear - More Detail Needed',
    estimated_diagnosis_sentence: 'Unclear - More Detail Needed',
    message:
        'This image is not clear enough to give a confident diagnosis. Please try uploading a closer, sharper photo of the problem area, or describe the issue in more detail below.',
    action_required: '',
    contractor_checklist: [],
    homeowner_prep: '',
    image_descriptions: [],
    image_observations: [],
    clarification_questions: [],
    diy_verification: '',
    photo_request: '',
    confidence_drivers: [],
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
    /** Number of images passed in contents — used to enforce image_descriptions count. */
    imageCount?: number;
    ctx?: { userId?: string | null; conversationId?: string | null };
}): Promise<ProseResult> {
    const stepStart = Date.now();
    try {
        const model = getDiagnosisModel();

        const systemPrompt = buildProseSystemPrompt(
            params.classification,
            params.baseSystemInstruction,
        );

        // When images were supplied, tell the model exactly how many descriptions to produce
        // and instruct it to look specifically for absent/detached components in each image.
        const imageCount = typeof params.imageCount === 'number' ? params.imageCount : 0;
        const imageInstruction =
            imageCount > 0
                ? ` ${imageCount} image${imageCount > 1 ? 's were' : ' was'} provided — image_descriptions MUST contain exactly ${imageCount} entries, one per image in order. For each image, explicitly name the components visible and call out any part that is MISSING, detached, or asymmetric (e.g. a spring present on one side but absent on the other, a bent connecting rod, a displaced bracket).${
                      imageCount > 1
                          ? ' Apply the MULTI-IMAGE SYNTHESIS PROTOCOL described in the system prompt.'
                          : ''
                  }`
                : '';

        const proseContents: GeminiContent[] = [
            ...params.contents,
            {
                role: 'user' as const,
                parts: [
                    {
                        text: `Write the prose fields for the home maintenance issue above. Use British English. Output structured JSON only.${imageInstruction}`,
                    },
                ],
            },
        ];

        const result = await model.generateContent({
            systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
            contents: proseContents,
            generationConfig: {
                temperature: params.isProviderHydration ? 0.22 : 0.35,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1200,
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: PROSE_SCHEMA as any,
                // Gemini 2.5 Flash native reasoning — improves diagnostic accuracy and visual
                // grounding without surfacing thinking text to the homeowner. The thought field
                // in the schema is a purpose-built 2–3 sentence homeowner-facing explanation;
                // thinkingBudget improves the quality of that field and all other fields.
                // Budget of 1024 balances output quality gain against per-call latency.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...({ thinkingConfig: { thinkingBudget: 1024 } } as any),
            },
        });

        const usage = result.response.usageMetadata;

        // Fire-and-forget cost log — never blocks the response
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/prose',
            modelName: GEMINI_MODEL_NAME,
            userId: params.ctx?.userId,
            conversationId: params.ctx?.conversationId,
        });

        let raw: string;
        try {
            raw = result.response.text().trim();
        } catch (texErr) {
            console.error('[agent-prose] response.text() failed', texErr);
            logPipelineStep({
                stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
                conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
                modelName: GEMINI_MODEL_NAME, errorMessage: 'response.text() threw',
                promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
            });
            return { ...FALLBACK_PROSE, requestFailed: true };
        }

        const parsed = parseProseResponse(raw);
        if (!parsed) {
            const reason = raw ? 'JSON parse failed' : 'empty model text';
            console.error(`[agent-prose] ${reason}`, raw ? raw.slice(0, 600) : {
                cand: result.response.candidates?.length ?? 0,
            });
            logPipelineStep({
                stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
                conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
                modelName: GEMINI_MODEL_NAME, errorMessage: reason,
                promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
            });
            return { ...FALLBACK_PROSE, requestFailed: true };
        }

        logPipelineStep({
            stepName: 'agent-prose', status: 'ok', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: GEMINI_MODEL_NAME,
            promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
        });
        return parsed;
    } catch (e) {
        console.error('[agent-prose] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: GEMINI_MODEL_NAME,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
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
        // estimated_diagnosis_sentence is no longer in the model schema — derive server-side.
        estimated_diagnosis_sentence: toHeadlineStyle(prose.diagnosis),
        trade_detail: undefined, // not prose's field
        action_required: stripFillerSentenceStarts(prose.action_required),
        ...(prose.requestFailed ? { requestFailed: true as const } : {}),
    } as ProseResult;
}
