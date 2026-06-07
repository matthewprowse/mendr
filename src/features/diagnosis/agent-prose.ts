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

import { Type } from '@google/genai';
import type { Content as GeminiContent } from '@google/genai';
import {
    getDiagnosisModel,
    getDiagnosisModelByName,
    GEMINI_MODEL_NAME,
} from '@/lib/ai/ai-diagnosis-backend';
import { getGenAiClient } from '@/lib/ai/ai-client';
import { getOrCreateCachedSystemPrompt } from '@/lib/ai/gemini-cache-manager';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import { toHeadlineStyle, stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import type { DiagnosisData } from '@/features/diagnosis/types';
import { buildCatalogBlockForClassification } from '@/features/diagnosis/prompts/failure-mode-serializer';
import { TAXONOMY_NONE_ID } from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import {
    resolveVariant,
    getProseSystemPrompt,
    getProseSamplingParams,
    type PromptVariant,
} from '@/features/diagnosis/prompts/variants/prompt-variant';
import {
    buildProseSystemPrompt_v35_native_static,
    buildProseSystemPrompt_v35_native_dynamic,
} from '@/features/diagnosis/prompts/variants/v3_5_native/prose-system-prompt';

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

/** Re-exported here for prose-internal convenience; canonical definition lives in `types.ts`. */
export type StructuredClarification = NonNullable<DiagnosisData['structured_clarification']>;

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
     *
     * From v7.4: derived server-side from `structured_clarification` when
     * the model produced one, so older UI surfaces keep working.
     */
    clarification_questions?: string[];
    /**
     * Structured multi-hypothesis clarification (v7.4+). Populated when
     * `requires_clarification` is true. See `types.ts` for the canonical
     * shape — this is the same structure, re-exported via `StructuredClarification`.
     */
    structured_clarification?: StructuredClarification;
    /** True when the prose Gemini call / JSON parse failed and we soft-degraded to fallback. */
    requestFailed?: boolean;
    /**
     * Post-parse override fields. Normally requires_clarification + confidence
     * live on the Classification result and the response-builder reads them
     * from there. But when post-parse logic detects a problem in the prose
     * output (e.g. the thought↔title disconnect — model identified an
     * upstream cause in its thought but committed a downstream-symptom title),
     * we need to force the response into clarification mode. These fields
     * carry that signal from agent-prose to the response-builder.
     */
    requires_clarification?: boolean;
    confidence?: number;
}

// ── Public error type ─────────────────────────────────────────────────────────

/**
 * Thrown by `runProseGeneration` when the model call or parse fails in a way
 * that the caller is expected to decide about (retry, surface to user, etc).
 *
 * The detail payload includes whatever was recoverable from the failed call —
 * parsed model output (if any), `finish_reason`, and a raw-response excerpt —
 * so the caller can route the error sensibly without re-parsing.
 *
 * Reserved for *legitimate* failures (model error, parse error, schema
 * mismatch). The legacy `requestFailed: true` + `FALLBACK_PROSE` soft-degrade
 * path is kept ONLY as a last resort and is loudly logged when it fires; the
 * preferred behaviour is to throw this error and let the route decide.
 */
export class ProseGenerationError extends Error {
    readonly kind:
        | 'empty_response'
        | 'parse_failed'
        | 'schema_mismatch'
        | 'response_text_threw'
        | 'model_threw'
        | 'short_thought';
    readonly detail: {
        finishReason?: string;
        rawExcerpt?: string;
        parsed?: Partial<ProseResult> | null;
        promptTokens?: number;
        completionTokens?: number;
        cause?: unknown;
    };

    constructor(
        kind: ProseGenerationError['kind'],
        message: string,
        detail: ProseGenerationError['detail'] = {},
    ) {
        super(message);
        this.name = 'ProseGenerationError';
        this.kind = kind;
        this.detail = detail;
    }
}

// ── JSON schema (Gemini structured output) ─────────────────────────────────────
// `thought` is declared FIRST so Gemini streams it before longer fields.

const PROSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        thought: {
            type: Type.STRING,
            description:
                'A 4-6 sentence reasoning trace showing how you arrived at the diagnosis, 400-700 characters total. Structure: (1) a synthesised summary of what the visible evidence shows across all photos combined (treat them as a single picture of the issue — do NOT enumerate per-image), (2) what specific component appears to have failed, (3) any cascading or secondary effects of that failure, (4) why this conclusion fits the visible evidence better than alternatives. This is the homeowner-facing "How I worked this out" section — they read it to assess whether to trust the diagnosis. STRICT RULE: NEVER reference photos by number or position (no "Image 1", "the second image", "the first photo", "image two", "in the third one"). The homeowner sees a thumbnail grid, not numbered slides. Describe what the camera shows, attribute observations to components or sides (e.g. "the left torsion spring", "the underside of the lid"), never to image indices. No em dashes. No mention of contacting specialists or next steps. Start each sentence with a capital letter.',
        },
        diagnosis: {
            type: Type.STRING,
            description:
                'Diagnosis title. Plain language. Max 75 characters and max 7 words. Headline-Style Title Case. No commas, colons, slashes, jargon, or conjunctions like or/and. Pick the single most likely cause. NEVER use generic placeholders like "Unclear", "Needs Clarification", or "Service Not Currently Supported" — even when requires_clarification is true, name the most likely failed component (e.g. "Broken Torsion Spring"). The server may append " (uncertain)" when confidence is low.',
        },
        message: {
            type: Type.STRING,
            description:
                '1–2 paragraphs separated by \\n\\n. Paragraph 1 (required): teaching diagnosis — explain the causal chain in plain language anchored in what the photo shows. No alarm words, no em dashes, no meta-commentary. Paragraph 2 (optional): only if a genuinely non-obvious hazard exists that the homeowner must act on before the contractor arrives. Do not describe what the contractor will do — that is covered in contractor_checklist.',
        },
        action_required: {
            type: Type.STRING,
            description:
                'Deprecated — leave as an empty string. All contractor and homeowner guidance is now in contractor_checklist and homeowner_prep.',
        },
        contractor_checklist: {
            type: Type.ARRAY,
            items: {
                type: Type.STRING,
                description:
                    'A complete sentence starting with a verb, describing one specific thing the contractor will inspect, test, or replace. Ends with a full stop. No em dashes.',
            },
            description:
                '2–4 full sentences describing what the contractor will concretely do on-site. Each sentence starts with a verb and ends with a full stop. Specific to the diagnosed fault — no generic entries like "Assess the problem." or "Provide a quote." British English. No em dashes. Empty array when requires_clarification or rejected is true.',
        },
        homeowner_prep: {
            type: Type.STRING,
            description:
                'One complete sentence: the single most practical thing the homeowner can do before the contractor arrives. Specific to this fault — for example: switch the geyser circuit breaker off at the DB board, isolate the water supply at the mains, clear access to the distribution board, note the error code shown on the display. Ends with a full stop. Return an empty string if nothing genuinely useful applies. No em dashes.',
        },
        image_descriptions: {
            type: Type.ARRAY,
            items: {
                type: Type.STRING,
                description:
                    'One entry per image: max 2 plain-language sentences of pure visual observation — name the specific components visible and their condition. Critically: note any component that is MISSING, detached, absent, or asymmetric (e.g. spring present on one side but not the other, bent rod, displaced bracket). Each entry must reference a feature distinguishable only in THAT specific image — never copy-paste between entries. Be specific, not generic. No causal chain beyond what is directly visible. STRICT RULE: NEVER start an entry with "Image N shows...", "The first photo...", "In the second image...", or any reference to the image\'s number or position. Open by naming the component or scene directly (e.g. "The left torsion spring is missing from its bracket...", "A diagonal crack runs from the top corner of the lintel...", "Water staining covers the lower third of the ceiling panel..."). The homeowner is looking at this image when they read this — describe what they\'re seeing, not which slot it occupies.',
            },
            description: 'Exactly one entry per image provided, in order. Count must match the number of images submitted. Each entry must call out a feature visible only in THAT image. No entry may reference its image by number or position — describe what is shown, not which image it is.',
        },
        image_observations: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    primary_observation: {
                        type: Type.STRING,
                        description:
                            'The single most diagnostically significant thing visible in this image, in 5-20 words. Be specific — name the component, condition, and any visible damage or absence. Bad: "a garage door". Good: "left torsion spring is missing from its bracket; the right one is intact and seated correctly". STRICT RULE: do NOT begin with "Image N shows...", "the first/second/third photo...", or any reference to image number or position — open by naming the component or condition directly.',
                    },
                    components_visible: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                            'Specific named components the camera clearly shows in this image. Each entry is one named part — for example "right torsion spring", "ceiling-mounted rail", "DB board main breaker", "pressure relief valve". Empty array only when nothing identifiable is visible.',
                    },
                    components_missing_or_damaged: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                            'Specific named components that are MISSING, detached, asymmetric, deformed, burnt, or otherwise damaged in this image. Each entry includes the nature of the issue — for example "left torsion spring (absent, only bracket remains)", "connecting rod (bent at midpoint)", "thermostat housing (scorched on lower edge)". Empty array when nothing is visibly damaged or missing.',
                    },
                    role_in_diagnosis: {
                        type: Type.STRING,
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
            type: Type.ARRAY,
            items: {
                type: Type.STRING,
                description:
                    'A short statement the homeowner taps to confirm — phrased in their own words, describing a symptom or context they can observe. Max 8 words. Must be mutually exclusive with the other chips in this array.',
            },
            description:
                'Backward-compat flat list of chips for older UI surfaces. When `structured_clarification` is produced, this can be left empty and the server will derive it from the first hypothesis. Otherwise: only populate when requires_clarification is true. Exactly 3–4 chips covering the single most important unknown that would change the diagnosis. Options must be mutually exclusive and collectively exhaustive — the last chip is always a catch-all (e.g. "Something else is happening."). Empty array when requires_clarification is false.',
        },
        structured_clarification: {
            type: Type.OBJECT,
            description:
                'Required when requires_clarification is true (and not rejected/unserviced). 2–3 ranked hypotheses, each with its own discriminating question and 3 answer chips. Omit / null when requires_clarification is false.',
            properties: {
                intro: {
                    type: Type.STRING,
                    description:
                        'One short sentence (max 25 words) introducing the clarification flow to the homeowner. Plain language. No em dashes. Example: "Two things could be causing this — answering one quick question will narrow it down."',
                },
                hypotheses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: {
                                type: Type.STRING,
                                description:
                                    'Stable id for this hypothesis: "h1" for the highest-confidence hypothesis, "h2" for the second, "h3" for the third. Always lowercase.',
                            },
                            label: {
                                type: Type.STRING,
                                description:
                                    'Specific failed component or fault, in Headline-Style Title Case (max 7 words). Example: "Broken Torsion Spring", "Failed Geyser Element", "Burst Mains Supply Pipe". This label becomes the diagnosis title when this hypothesis is selected.',
                            },
                            confidence: {
                                type: Type.INTEGER,
                                description:
                                    'Integer 0–100. The model\'s own confidence in this hypothesis. Hypotheses MUST be listed in descending confidence order (h1 highest).',
                            },
                            why: {
                                type: Type.STRING,
                                description:
                                    'One sentence explaining why this hypothesis is plausible given the visible evidence and description. Plain language. No em dashes.',
                            },
                            discriminating_question: {
                                type: Type.STRING,
                                description:
                                    'A single question that, if answered, would shift THIS hypothesis\'s confidence by at least 20 points (up or down). Must be specific to this hypothesis — not a generic "tell me more". Example: "Is the door fully closed, or is it stuck partly open?"',
                            },
                            answer_chips: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        id: {
                                            type: Type.STRING,
                                            description:
                                                'Stable chip id within this hypothesis: "c1", "c2", "c3". Lowercase.',
                                        },
                                        text: {
                                            type: Type.STRING,
                                            description:
                                                'The chip text the homeowner taps. Max 8 words, plain language. MUST describe the diagnosed subcategory (use the subcategory_id from the system prompt context) — chips that refer to a different equipment type are a hard failure.',
                                        },
                                        effect: {
                                            type: Type.STRING,
                                            description:
                                                'Exactly one of "confirms" (selecting this chip pushes the hypothesis confidence up by ≥20 points), "rules_out" (pushes it down by ≥20 points), or "partial" (a weaker signal in either direction).',
                                        },
                                    },
                                    required: ['id', 'text', 'effect'],
                                },
                                description:
                                    'Exactly 3 chips per hypothesis. Mutually exclusive, collectively exhaustive answers to the discriminating_question. Each chip\'s text must reference the diagnosed subcategory — not a sibling subcategory.',
                            },
                        },
                        required: [
                            'id',
                            'label',
                            'confidence',
                            'why',
                            'discriminating_question',
                            'answer_chips',
                        ],
                    },
                    description:
                        '2–3 hypotheses ranked by confidence descending. h1 is always the highest-confidence label and becomes the diagnosis title.',
                },
                escape: {
                    type: Type.OBJECT,
                    properties: {
                        prompt: {
                            type: Type.STRING,
                            description:
                                'One short sentence inviting the user to describe their situation in free text when none of the hypotheses match. Example: "Doesn\'t match any of these? Tell me what you\'re seeing in your own words."',
                        },
                    },
                    required: ['prompt'],
                    description:
                        'The "Something else" escape card shown alongside the hypothesis chips.',
                },
            },
            required: ['intro', 'hypotheses', 'escape'],
        },
        diy_verification: {
            type: Type.STRING,
            description:
                'One sentence describing how the homeowner can themselves verify the diagnosis is correct, without tools and without risk. Must be specific to the diagnosed fault — for example "With the motor disengaged, lift the door by hand; if it stays balanced halfway up the spring tension is fine." or "Place a dry sheet of paper under the joint overnight; a wet patch confirms an active leak." Empty string only when no safe verification exists.',
        },
        photo_request: {
            type: Type.STRING,
            description:
                'When zero images were provided or when an additional photo would meaningfully improve the diagnosis, specify exactly what photo would help. Be specific about the angle and what should be visible — for example "A photo of the underside of the geyser showing the pressure relief valve and any drip tray would let me confirm whether the leak is from the valve or the tank." Empty string when no additional photo would help.',
        },
        confidence_drivers: {
            type: Type.ARRAY,
            items: {
                type: Type.STRING,
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

// Exported for prompt-variant resolver (re-exported as `_v25` from
// `prompts/variants/v2_5-builders.ts`). The variant resolver decides whether
// to call this v2.5 baseline or a future v3.5 sibling.
export function buildProseSystemPrompt(
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

YOUR ONLY JOB: write the prose fields (thought, diagnosis, message, action_required, contractor_checklist, homeowner_prep, image_descriptions, image_observations, diy_verification, photo_request, confidence_drivers, and structured_clarification when requires_clarification is true). No em dashes anywhere in any field.
Accept the classification above as ground truth. Do not re-classify. Do not change trade.

DIAGNOSIS TITLE RULE: The diagnosis field MUST name the most likely failed component, even when requires_clarification is true. Never emit generic placeholders like "Unclear", "Needs Clarification", or "Service Not Currently Supported" in the diagnosis field — the server owns those special-case titles when rejected/unserviced is true. When trade_detail is not "(none)", diagnosis MUST describe the SAME fault / equipment as trade_detail — same plain meaning, concise headline (stay within diagnosis length limits).

${classification.rejected || classification.unserviced
    ? 'Because rejected or unserviced is true: keep message warm and helpful. Explain what Mendr does offer.'
    : ''}
${classification.requires_clarification && !classification.rejected
    ? 'Because requires_clarification is true: ask a targeted follow-up question in message. Keep action_required minimal. Populate structured_clarification with 2–3 ranked hypotheses (see STRUCTURED CLARIFICATION block below) — and still pick the highest-confidence hypothesis label as the diagnosis title.'
    : ''}`;

    const structuredClarificationBlock = classification.requires_clarification && !classification.rejected
        ? `STRUCTURED CLARIFICATION (required because requires_clarification is true — produce the structured_clarification object):
Goal: name the 2–3 most plausible specific faults, and for each, the single question that would best discriminate it from the others.

Hard rules:
1. List 2–3 hypotheses ranked by confidence DESCENDING. h1 is the highest, h2 next, h3 lowest.
2. Each hypothesis MUST name a specific failed component or fault in Headline-Style Title Case (e.g. "Broken Torsion Spring", "Failed Geyser Element", "Burst Mains Supply Pipe"). Never "Unclear" / "Needs More Info" / "Possible Issue". h1's label is the diagnosis title — pick the most likely specific component.
3. Each hypothesis has ONE \`discriminating_question\` — a question whose answer would shift THAT hypothesis's confidence by ≥20 points. Not generic ("tell me more"); must be specific.
4. Each hypothesis has EXACTLY 3 \`answer_chips\`. Each chip is at most 8 words and MUST describe the diagnosed subcategory (subcategory_id: ${classification.subcategory_id}). A chip about a different equipment type is a hard failure.
5. Each chip has \`effect\` set to "confirms", "rules_out", or "partial":
   - "confirms": selecting this chip pushes the hypothesis confidence UP by ≥20 points.
   - "rules_out": selecting this chip pushes the confidence DOWN by ≥20 points.
   - "partial": a weaker directional signal (e.g. only narrows from one of several causes).
6. The \`escape\` block has one prompt sentence inviting the user to describe their situation in free text when none match. Example: "Doesn't match any of these? Tell me what you're seeing in your own words."
7. The \`intro\` is one short sentence framing the choice for the homeowner.
8. ALSO populate the backward-compat \`clarification_questions\` array with the 3 chip texts from h1 (the highest-confidence hypothesis). The server can derive it server-side if you omit it.

Good example hypothesis (garage door, subcategory_id=garage_door_fault):
  { id: "h1", label: "Broken Torsion Spring", confidence: 65, why: "Door is stuck closed and one side appears asymmetric.",
    discriminating_question: "Can you lift the door manually with the motor disengaged?",
    answer_chips: [
      { id: "c1", text: "Too heavy to lift", effect: "confirms" },
      { id: "c2", text: "Lifts but drops fast", effect: "partial" },
      { id: "c3", text: "Lifts and stays open", effect: "rules_out" }
    ] }
`
        : `Leave structured_clarification omitted (requires_clarification is false).`;

    const clarificationBlock = classification.requires_clarification && !classification.rejected
        ? `CLARIFICATION_QUESTIONS (flat backward-compat list):
You can leave \`clarification_questions\` as an empty array — the server will derive it from \`structured_clarification.hypotheses[0].answer_chips\`. If you do populate it, use the 3 chip texts from h1.
Each chip MUST describe the diagnosed equipment/subcategory (subcategory_id: ${classification.subcategory_id}). Not a sibling subcategory.`
        : `Leave clarification_questions as an empty array (requires_clarification is false).`;

    const visualAndUrgencyBlock =
        classification.rejected || classification.unserviced
            ? ''
            : `
VISUAL ANCHORING (Agent 2b — thought, image_descriptions, and teaching paragraphs when a photo is in play):
- Ground every concrete diagnostic claim in what is actually visible: parts, gaps, height misalignment, stains, deformation, exposed conductors, fluid, corrosion, mounting, burn marks, etc. Say what the camera shows, then tie the fault to that evidence.
- Do NOT pad with generic encyclopaedic filler: avoid "common point of failure", "often fails here", "typical weak spot", "many homeowners see this", or statistical generalities unless the user asked for prevalence.
- Do NOT use progressive-damage wording ("before the fault spreads", "could spread", "might spread") unless the issue is genuinely progressive. Static mechanical faults do not "spread" like mould or water.
- NEVER refer to images by number or position in any user-facing output field (\`thought\`, \`message\`, \`image_descriptions\`, \`image_observations.primary_observation\`). The homeowner sees thumbnails, not a numbered slideshow. Forbidden openings: "Image 1 shows", "The first photo", "In the second image", "image two", "the third one". Attribute observations to components or sides (e.g. "the left spring", "the underside of the geyser") or describe them directly (e.g. "A diagonal crack runs from..."). This is a surface-text rule only — your internal per-image enumeration in the protocol below is unaffected; just don't emit "Image N" in the actual output.

MULTI-IMAGE SYNTHESIS PROTOCOL (apply when more than one image is provided):
1. Treat the full image set as a SINGLE combined evidence base, not as separate scenes to summarise independently.
2. The FIRST image in the input has been positioned by the user as their primary view. Weight it accordingly.
3. Before committing to a diagnosis: mentally identify the single image that shows the clearest direct mechanical or electrical fault. Anchor the diagnosis to that image.
4. Use the remaining images to corroborate, qualify, or contradict the primary observation. They are not licence to introduce additional unrelated faults.
5. ABSENCE DETECTION: compare symmetric features across images. A component absent on one side when symmetry is expected (e.g. a torsion spring present on one side but missing on the other, a hinge, a cable, a roller) is a primary fault signal — name it explicitly in image_descriptions and in thought.
6. CONFLICT HANDLING: when two images appear to point at different causes, do NOT silently pick one. Name the conflict explicitly in \`thought\`, prioritise the cause supported by direct mechanical or electrical damage, and lower confidence rather than committing confidently.
7. image_descriptions must contain EXACTLY one entry per image in input order. Each entry must call out any component that is MISSING, detached, asymmetric, or deformed.
8. EVERY image_descriptions entry must be VISUALLY DISTINCT from the others. Each entry must reference a feature distinguishable only in THAT specific image — name the side, the angle, the close-up detail, or the component that is visible only in this frame. Do not repeat the same sentence across images. If two photos show the same equipment from different angles, the entries still differ in what they reveal — name the distinguishing observation per image. If you cannot name a distinguishing observation for an image, say "Same equipment as image N, no additional visible faults" — never copy-paste the previous entry. Repetition across entries is a diagnostic failure: it implies you did not actually look at each image.

CROSS-IMAGE OBSERVATION TABLE (mandatory pre-output discipline when any images are present):
Before you commit to the diagnosis fields, internally enumerate each image:
  Image 1: what does it show? what components are visible? what is missing / damaged / asymmetric?
  Image 2: same enumeration.
  Image 3: same enumeration.
  Image 4: same enumeration.
Then choose which single image is the PRIMARY EVIDENCE — the image showing the most direct fault. Mark it \`primary_evidence\` in image_observations. Mark the others as \`corroborating\`, \`contradicting\`, or \`context_only\` based on whether they support, conflict with, or merely contextualise the primary evidence.
If two images point to genuinely different causes, mark the second one \`contradicting\`, explicitly name the conflict in \`thought\`, and lower confidence accordingly — do NOT silently pick a winner.
The image_observations array MUST contain exactly one entry per image submitted, in submission order, with exactly one entry tagged \`primary_evidence\` whenever at least one image is present.`.trim();

    // ── USER-IDENTIFIED CAUSE RULE ─────────────────────────────────────────────
    // When the homeowner has stated a root cause that explains the visible
    // damage, the diagnosis title and narrative must LEAD with that cause —
    // visible effects are secondary. When the homeowner's claim contradicts
    // the visuals, we DO NOT silently override either side; we surface both
    // hypotheses as a structured_clarification so the user resolves it.
    //
    // This is a Bucket C general principle — no trade names embedded.
    const userCauseBlock = `USER-IDENTIFIED CAUSE — CONSISTENCY CHECK (apply whenever the user's text mentions a specific component, cause, or failure event):

1. EXTRACT the user's stated cause. Phrases like "the spring is missing", "the geyser is leaking from the bottom", "the breaker keeps tripping" name a specific component or event the homeowner is treating as the root cause.

2. RUN THE CONSISTENCY CHECK. Compare the user's stated cause against the visible evidence in the photos:
   a) CONSISTENT — does the visible damage plausibly result from the user's stated cause? Example: user says "spring is missing", photos show a tilted door with a bent connecting rod. A missing spring causes the door to fall unsupported, which bends downstream linkage. The user's cause EXPLAINS the visible effects. → Treat as consistent.
   b) CONTRADICTORY — does the visible evidence directly conflict with the user's stated cause? Example: user says "the breaker tripped" but photos show a clearly burnt outlet with charring around the receptacle. The burnt outlet is the primary fault, not a downstream effect of a tripped breaker. → Treat as contradictory.

3. ACT ON THE OUTCOME:

   IF CONSISTENT:
   - The \`diagnosis\` title MUST name the user's stated cause as the primary failure. The visible secondary damage goes in \`cascading_damage\`, not the title.
   - The \`thought\` opens with the user's cause and explains how it produced the visible effects.
   - The \`failed_component\` MUST match the user's named component.
   - Confidence can stay high (the user has given you a direct anchor).
   - Title format example given the spring scenario: "Missing Torsion Spring", NOT "Bent Connecting Rod" — the latter is a symptom, not the failure.
   - HARD FAILURE: leading the title with a downstream effect when the user has explicitly named the upstream cause is wrong. A diagnosis of "Bent connecting rod" when the user said the spring is missing is incorrect — the bent rod is what the missing spring DID.

   IF CONTRADICTORY:
   - Do NOT silently override either side. Do NOT discard the user's claim. Do NOT discard your visual interpretation.
   - Set \`requires_clarification\` to true.
   - Drop \`confidence\` to between 50 and 70.
   - Produce a \`structured_clarification\` with TWO hypotheses: (h1) the user's stated cause, (h2) the cause the visuals point to. Each hypothesis gets its own discriminating_question + answer_chips that would resolve the conflict.
   - In the \`thought\`, explicitly name the disagreement and what would resolve it. Example phrasing: "You mentioned X, but the photos appear to show Y — these point to different causes. The question below will help confirm which is the actual fault."

4. NEVER ASSUME THE USER IS WRONG WITHOUT EVIDENCE. NEVER ASSUME THE USER IS RIGHT WITHOUT THE EVIDENCE SUPPORTING IT. When in doubt, ASK — that is what the structured_clarification flow exists for.`;

    // ── USER-NAMED EQUIPMENT — AUTHORITATIVE NAMING RULE ───────────────────────
    // Phase 1 — Diagnostic Accuracy Hardening. Equipment-naming is more
    // authoritative than cause-naming because the homeowner OWNS the
    // equipment; we are only looking at a photo. When the homeowner names
    // specific equipment in their text, that equipment wins for trade,
    // subcategory_id, and failed_component category. Bucket C general
    // principle — no trade names embedded.
    const userNamedEquipmentBlock = `USER-NAMED EQUIPMENT — AUTHORITATIVE NAMING RULE

When the homeowner explicitly names specific equipment in their text or history (e.g. "the geyser is leaking", "our gate motor stopped responding", "the JoJo tank pressure is low"), that equipment is AUTHORITATIVE for trade and subcategory_id selection.

Your visual interpretation does not override the homeowner's named equipment. They live with the equipment; you are looking at a photo.

If your visual interpretation conflicts with the user's named equipment:
- The user's name wins for trade + subcategory_id + failed_component category.
- Drop confidence to 70–80.
- Produce a structured_clarification whose h1 is the user-named equipment hypothesis and h2 is your visual interpretation. Let the user resolve.

This is different from the USER-IDENTIFIED CAUSE rule (which handles named failure CAUSES). Equipment naming is more authoritative than cause naming — equipment is what the homeowner OWNS, cause is what they BELIEVE.`;

    // ── FAILURE-MODE CATALOG ───────────────────────────────────────────────────
    // Phase 1 — Diagnostic Accuracy Hardening. Inject the primary + sibling
    // failure-mode catalog for the locked-in subcategory so the prose agent
    // has structured guidance about what specific failures are recognised
    // for this equipment class. Empty string when no catalog exists for
    // this subcategory (handled by the filter on `parts` below).
    const failureModeCatalogBlock = buildCatalogBlockForClassification(
        classification.subcategory_id,
    );

    // ── MANDATORY SYMMETRY ENUMERATION ─────────────────────────────────────────
    // Equipment with bilateral/repeating structure (left vs right, top vs
    // bottom, paired components) requires explicit side-by-side enumeration
    // BEFORE the model commits to a diagnosis. The existing ABSENCE DETECTION
    // rule (visualAndUrgencyBlock rule 5) tells the model to do this but
    // doesn't make it a mandatory output step — the model was ignoring it on
    // garage door cases where a left-side extension spring was clearly missing
    // (visible asymmetry across photos). This block forces the enumeration to
    // appear in the `thought` field so the check is auditable and the model
    // can't skip it. Bucket C general principle — no trade names.
    const symmetryEnumerationBlock = `SYMMETRY ENUMERATION CHECKLIST (mandatory when the equipment has any bilateral or paired structure that is visible across the image set):

Equipment with bilateral / paired / repeating structure that REQUIRES side-by-side enumeration before diagnosis:
- Bilateral mechanical systems (anything that has a mirrored "left vs right" or "top vs bottom" arrangement of moving parts, springs, cables, hinges, rollers, brackets, panels)
- Paired counterbalance / load-distribution components (anything where you'd reasonably expect TWO of something to share load)
- Repeating multi-section assemblies (any system with multiple identical sections that should look uniform)

EXECUTION (you MUST perform this and write the result into the \`thought\` field BEFORE any diagnosis statement):

STEP 1 — Name the symmetry axis present in the equipment (e.g. "left side vs right side", "top section vs bottom section", "leading edge vs trailing edge").

STEP 2 — Enumerate components on each side. List every load-bearing, supporting, or balancing component you can see on each side of the symmetry axis. Be specific:
   • Side A: [list]
   • Side B: [list]

STEP 3 — Note any asymmetry. If side A has component X but side B does NOT have a matching component (or has a clearly broken/absent version), the asymmetry is itself a diagnostic finding.

STEP 4 — Apply the asymmetry to the diagnosis decision:
   • If the asymmetry reveals a missing or broken component: the missing/broken component IS the primary failure. Title and \`failed_component\` MUST name it. Visible damage on the other side (or downstream linkage) goes in \`cascading_damage\`. Confidence can remain high (≥85) because the asymmetry is direct evidence.
   • If you see asymmetric loading or sagging (one side lower than the other, one side bearing more weight) but cannot identify which component is missing: cap confidence at 75-82, set \`requires_clarification\` true, and produce \`structured_clarification\` asking the user which side's supporting component appears absent.

STEP 5 — Output the enumeration in your \`thought\`. The thought MUST contain at least one sentence beginning with "Comparing the two sides:" or "Symmetry check:" or equivalent, and that sentence MUST name what is present on one side and absent on the other (or confirm symmetry is intact). If the equipment has no bilateral structure, write "No bilateral symmetry to enumerate." instead.

HARD RULES:
- Skipping the symmetry enumeration when it applies is a diagnostic failure. The audit signal we use to detect this is the absence of the "Comparing the two sides:" / "Symmetry check:" sentence in your thought.
- When symmetry IS broken: leading the diagnosis title with the visible downstream damage (e.g. "Bent connecting rod", "Detached lifting arm", "Off-track door") instead of the missing symmetric counterpart (e.g. "Missing extension spring") is wrong. The bent / detached / off-track item is what the missing counterpart caused, not the failure itself.`;

    // ── CAUSE HIERARCHY — DOWNSTREAM-EFFECT HUMILITY ───────────────────────────
    // Many mechanical and structural failures show as downstream symptoms. The
    // visible damage is often NOT the part that failed first. The model has
    // been committing high-confidence diagnoses on downstream-symptom damage
    // (bent rod, detached arm) when the actual primary failure is a hidden
    // or absent upstream component (spring, cable, counterbalance). This
    // block forces humility on those cases. Bucket C general principle.
    const causeHierarchyBlock = `CAUSE HIERARCHY — DOWNSTREAM-EFFECT HUMILITY (mandatory when the visible damage looks like a downstream symptom):

Many mechanical and structural failures manifest as downstream symptoms — the visibly damaged part is NOT the part that actually failed first.

DOWNSTREAM-SYMPTOM INDICATORS (visible damage that is frequently a consequence of something else failing first):
- Anything bent, twisted, or deformed under load (bent rods, deformed brackets, warped panels)
- Anything detached from its mounting (lift arms, hinges, latches, brackets)
- Anything fallen, sagging, or hanging at an unexpected angle (asymmetric door / gate, sagging panel, leaning structure)
- Anything misaligned, off-track, or skewed (off-track door, skewed gate, panel out of plane)
- Anything torn, snapped, or sheared at a point that experiences indirect load
- Asymmetric load distribution (one side bearing more weight than the other, one side sagging)

When you observe a downstream-symptom indicator, you MUST run the cause-hierarchy check BEFORE committing the diagnosis:

PROTOCOL:

1. NAME the visible damage and its category (e.g. "detached lifting arm — downstream-symptom category: detached from mounting").

2. ASK: under normal operation, what component supports, loads, balances, or constrains this part? (e.g. "the lifting arm is constrained by the door's counterbalance system — typically extension springs or torsion springs.")

3. CHECK whether that supporting/balancing component is visible and intact:
   a) DIRECT EVIDENCE OF UPSTREAM FAILURE — if you can see (or asymmetry enumeration reveals) that the supporting component is missing, broken, or detached: COMMIT to the upstream cause as primary. Visible damage is \`cascading_damage\`. Confidence can stay high (≥85). The diagnosis title NAMES the upstream component (e.g. "Missing Extension Spring"), not the visible downstream effect.
   b) NO DIRECT EVIDENCE OF UPSTREAM (it's hidden, out of frame, or you genuinely cannot tell): cap \`confidence\` at 75-82, set \`requires_clarification\` to true, produce \`structured_clarification\` with TWO hypotheses:
      • h1: the visible damage as the primary failure (the conservative interpretation)
      • h2: the most likely upstream cause that would produce this damage pattern (your domain reasoning about what's typically hidden but commonly fails for this equipment+symptom)
      Each hypothesis gets its own \`discriminating_question\` that asks the user to confirm whether the upstream component is present and intact, or missing/broken.

4. NEVER commit at confidence ≥85 to a downstream-symptom diagnosis without either direct evidence ruling out the upstream cause OR explicit user confirmation. The model's instinct is to commit to what is most directly visible — this rule corrects that bias.

EXAMPLES OF CAUSE→EFFECT REASONING (do not copy these labels verbatim; apply the reasoning pattern):
- A door / gate that hangs lower on one side OR has a bent linkage on the other side: ASK what holds the door in balance. If a paired counterbalance component appears absent (per symmetry enumeration), that absent component is the primary failure.
- A motor arm that's bent or detached: ASK what loads that arm during normal operation. If the door / gate would normally be balanced by an external mechanism, an absence in that mechanism could explain the arm taking unintended load and failing.
- A pump fitting sheared off: ASK whether the pump itself was held in place under operating pressure. If a mounting bracket is loose or absent, the shear is downstream of the mounting failure.

HARD RULE: a diagnosis whose title names a downstream-symptom item (bent / detached / off-track / sagging / sheared) when the model has NOT explicitly run and documented the cause-hierarchy check is a diagnostic failure. The thought MUST contain a sentence acknowledging the cause-hierarchy check was performed (e.g. "Cause-hierarchy check: ..." or "Considering upstream causes: ...") before committing.`;

    // Subcategories where bilateral / paired-component analysis is meaningful.
    // For equipment that's structurally single-unit (geyser, db_board, single-
    // tap fixtures, pool pump motor) the symmetry check is noise — the model
    // ends up dutifully writing "Symmetry check: this is a single tank" which
    // is both unhelpful and erodes user trust. Only inject the block when:
    //   • the classifier identified a subcategory with paired components, OR
    //   • the classifier is unsure (none_unmapped) — keep the safety net for
    //     unfamiliar equipment where Agent 2c may have to reason from scratch.
    const SYMMETRY_RELEVANT_SUBCATEGORIES = new Set<string>([
        'garage_door_fault',
        'gate_motor_fault',
    ]);
    const symmetryShouldApply =
        classification.subcategory_id === TAXONOMY_NONE_ID ||
        SYMMETRY_RELEVANT_SUBCATEGORIES.has(classification.subcategory_id);
    const conditionalSymmetryBlock = symmetryShouldApply ? symmetryEnumerationBlock : '';

    const parts = [
        baseSystemInstruction,
        classBlock,
        userCauseBlock,
        userNamedEquipmentBlock,
        failureModeCatalogBlock,
        conditionalSymmetryBlock,
        causeHierarchyBlock,
        structuredClarificationBlock,
        clarificationBlock,
        visualAndUrgencyBlock,
    ].filter((s) => s && s.trim().length > 0);
    return parts.join('\n\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_IMAGE_OBSERVATION_ROLES: ReadonlyArray<ImageObservationRole> = [
    'primary_evidence',
    'corroborating',
    'contradicting',
    'context_only',
];

const VALID_CHIP_EFFECTS: ReadonlyArray<'confirms' | 'rules_out' | 'partial'> = [
    'confirms',
    'rules_out',
    'partial',
];

/**
 * Pattern matching the generic placeholder titles Agent 2b sometimes emits when
 * it's unsure. These titles confuse the homeowner — "Unclear - More Detail
 * Needed" tells them nothing and reads as a failed product, not a partial
 * diagnosis. The post-parse normaliser rewrites any matching title to use the
 * top hypothesis label from `structured_clarification` when available.
 */
export const PLACEHOLDER_TITLE_PATTERN =
    /^(unclear|needs?\s+clarification|needs?\s+more|service\s+not\s+currently\s+supported|possible\s+issue|requires?\s+(?:more\s+)?(?:info|detail)|undiagnosed)/i;

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
 * Validate and coerce the raw structured_clarification object from the model.
 *
 * Returns `undefined` when the input is missing, not an object, or has zero
 * usable hypotheses. Otherwise returns a strictly-typed StructuredClarification
 * with safe defaults — invalid chip effects coerced to "partial", missing ids
 * back-filled as h{n}/c{n}, and confidence clamped to 0–100.
 */
export function normaliseStructuredClarification(
    raw: unknown,
): StructuredClarification | undefined {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const obj = raw as Record<string, unknown>;
    const hypsRaw = Array.isArray(obj.hypotheses) ? (obj.hypotheses as unknown[]) : [];
    if (hypsRaw.length === 0) return undefined;

    const hypotheses: StructuredClarification['hypotheses'] = hypsRaw
        .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
        .map((h, hi) => {
            const id =
                typeof h.id === 'string' && h.id.trim().length > 0
                    ? h.id.trim()
                    : `h${hi + 1}`;
            const label =
                typeof h.label === 'string' && h.label.trim().length > 0
                    ? h.label.trim()
                    : '';
            const confidenceRaw = Number(h.confidence);
            const confidence = Number.isFinite(confidenceRaw)
                ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
                : 0;
            const why = typeof h.why === 'string' ? h.why.trim() : '';
            const discriminating_question =
                typeof h.discriminating_question === 'string'
                    ? h.discriminating_question.trim()
                    : '';
            const chipsRaw = Array.isArray(h.answer_chips)
                ? (h.answer_chips as unknown[])
                : [];
            const answer_chips = chipsRaw
                .filter(
                    (c): c is Record<string, unknown> =>
                        typeof c === 'object' && c !== null,
                )
                .map((c, ci) => {
                    const chipId =
                        typeof c.id === 'string' && c.id.trim().length > 0
                            ? c.id.trim()
                            : `c${ci + 1}`;
                    const text = typeof c.text === 'string' ? c.text.trim() : '';
                    const effect =
                        typeof c.effect === 'string' &&
                        (VALID_CHIP_EFFECTS as ReadonlyArray<string>).includes(c.effect)
                            ? (c.effect as 'confirms' | 'rules_out' | 'partial')
                            : 'partial';
                    return { id: chipId, text, effect };
                })
                .filter((c) => c.text.length > 0);
            return {
                id,
                label,
                confidence,
                why,
                discriminating_question,
                answer_chips,
            };
        })
        .filter((h) => h.label.length > 0 && h.answer_chips.length > 0);

    if (hypotheses.length === 0) return undefined;

    const intro =
        typeof obj.intro === 'string' && obj.intro.trim().length > 0
            ? obj.intro.trim()
            : 'A couple of things could be causing this — a quick answer will narrow it down.';
    const escapeRaw =
        typeof obj.escape === 'object' && obj.escape !== null && !Array.isArray(obj.escape)
            ? (obj.escape as Record<string, unknown>)
            : {};
    const escapePrompt =
        typeof escapeRaw.prompt === 'string' && escapeRaw.prompt.trim().length > 0
            ? escapeRaw.prompt.trim()
            : "Doesn't match any of these? Tell me what you're seeing in your own words.";

    return {
        intro,
        hypotheses,
        escape: { prompt: escapePrompt },
    };
}

/**
 * Normalise the diagnosis title so the user never sees a placeholder when a
 * specific hypothesis is available. Rewrites titles matching
 * PLACEHOLDER_TITLE_PATTERN to the top hypothesis label (h1) when present,
 * optionally appending " (uncertain)" if h1.confidence < 75.
 *
 * Does NOT rewrite when there is no structured_clarification — the response
 * builder owns the "Service Not Currently Supported" / "Photo Not Related" /
 * etc. special cases for rejected/unserviced.
 */
export function normaliseTitle(
    title: string,
    structured: StructuredClarification | undefined,
): string {
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!structured || structured.hypotheses.length === 0) return trimmed;
    if (!trimmed || PLACEHOLDER_TITLE_PATTERN.test(trimmed)) {
        const top = structured.hypotheses[0];
        const base = top.label.trim();
        if (!base) return trimmed;
        return top.confidence < 75 ? `${base} (uncertain)` : base;
    }
    return trimmed;
}

/**
 * Markers in the THOUGHT text that indicate the model has reasoned about an
 * UPSTREAM cause for downstream visible damage. When these markers appear in
 * the thought BUT the diagnosis title leads with downstream-symptom language
 * (bent / detached / off-track / etc.), the model has identified the upstream
 * cause in its reasoning but failed to translate it into the title — the
 * exact failure mode caught on the 21:27 garage door test where the thought
 * said "failure in the left side's counterbalance system, such as a spring
 * or cable" but the title was "Detached Garage Door Lifting Arm".
 */
const UPSTREAM_CAUSE_REASONING_MARKERS =
    /\b(counterbalance|balance has failed|imbalance|absent on (one|the [a-z]+) side|missing (on one|from (the )?(left|right|one) side)|asymm|direct consequence of|caused by (?:the |a )?(?:missing|broken|failed|absent)|downstream of|loss of (?:proper )?(?:support|balance|tension)|undue (?:load|stress|strain)|support(?:ing)? (?:component|system|mechanism) (?:is |has |appears )(?:missing|absent|failed|broken)|spring or cable|counterbalance system|tension (?:has|appears) (?:lost|gone|absent))\b/i;

/**
 * Pattern of upstream-cause labels we might find in the thought, in priority
 * order. Used to derive a hypothesis label when forcing structured_clarification
 * after detecting thought↔title disconnect. Returns the matched phrase (with
 * surrounding context) the caller can use as a hypothesis label.
 */
const UPSTREAM_CAUSE_NOUN_PATTERNS: RegExp[] = [
    /\b(missing|absent|failed|broken)\s+(?:left[- ]side\s+|right[- ]side\s+)?(extension spring|torsion spring|counterbalance spring|spring or cable|spring|cable|counterbalance|tension cable|lifting cable)\b/i,
    /\bcounterbalance\s+(?:system|mechanism|spring|cable)\b/i,
    /\b(?:left|right)[- ]side\s+(?:counterbalance|spring|cable|support)\b/i,
];

/**
 * Detect whether the title leads with downstream-symptom language while the
 * thought identifies an upstream cause. Returns the suggested upstream-cause
 * label when the disconnect is present, or null when no rewrite is warranted.
 */
export function detectThoughtTitleDisconnect(
    title: string,
    thought: string,
): { suggestedUpstreamLabel: string } | null {
    const titleTrim = typeof title === 'string' ? title.trim() : '';
    const thoughtTrim = typeof thought === 'string' ? thought.trim() : '';
    if (!titleTrim || !thoughtTrim) return null;
    if (!DOWNSTREAM_SYMPTOM_LABELS.test(titleTrim)) return null;
    if (!UPSTREAM_CAUSE_REASONING_MARKERS.test(thoughtTrim)) return null;
    // Try to extract a specific upstream-cause noun phrase from the thought.
    for (const re of UPSTREAM_CAUSE_NOUN_PATTERNS) {
        const m = thoughtTrim.match(re);
        if (m && m[0]) {
            // Title-case the match for use as a hypothesis label.
            const phrase = m[0].replace(/\s+/g, ' ').trim();
            return { suggestedUpstreamLabel: titleCaseLabel(phrase) };
        }
    }
    // Fallback: we know there's a disconnect but couldn't extract a specific
    // upstream noun phrase. Use a generic label that conveys uncertainty.
    return { suggestedUpstreamLabel: 'Upstream Support or Counterbalance Failure' };
}

function titleCaseLabel(s: string): string {
    return s
        .split(/\s+/)
        .map((w) => {
            const lower = w.toLowerCase();
            // Don't capitalise small connector words mid-phrase.
            if (['or', 'and', 'of', 'the', 'a', 'an'].includes(lower)) return lower;
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(' ')
        .replace(/^[a-z]/, (c) => c.toUpperCase()); // Always cap first word.
}

/**
 * Force a structured_clarification when the thought↔title disconnect is
 * detected. Two hypotheses: h1 = the upstream cause from the thought, h2 =
 * the downstream symptom from the original title. Drops confidence to 75 and
 * sets requires_clarification=true on the parsed payload.
 *
 * Mutates `parsed` in place. Safe to call when no disconnect is present
 * (no-op in that case).
 */
function applyThoughtTitleDisconnectRewrite(parsed: ProseResult): void {
    const disconnect = detectThoughtTitleDisconnect(
        parsed.diagnosis ?? '',
        parsed.thought ?? '',
    );
    if (!disconnect) return;
    // Don't override an already-produced structured_clarification — if the
    // model genuinely emitted hypotheses, trust them.
    if (parsed.structured_clarification && parsed.structured_clarification.hypotheses.length >= 2) {
        return;
    }

    const downstreamLabel = titleCaseLabel(parsed.diagnosis ?? 'Visible Damage');
    const upstreamLabel = disconnect.suggestedUpstreamLabel;

    parsed.structured_clarification = {
        intro:
            "I've identified two possible primary causes — your input on which matches what you see will lock the diagnosis.",
        hypotheses: [
            {
                id: 'h1',
                label: upstreamLabel,
                confidence: 70,
                why: 'My reasoning identified this as the likely upstream cause that produced the visible damage. Asymmetry and load patterns point to this.',
                discriminating_question:
                    "Look at the supporting / counterbalance components on the equipment. Is one of them visibly absent, broken, or detached?",
                answer_chips: [
                    { id: 'c1', text: "Yes — one side's support is missing or broken.", effect: 'confirms' },
                    { id: 'c2', text: 'No — both supports are present and intact.', effect: 'rules_out' },
                    { id: 'c3', text: "I can't tell from where I'm looking.", effect: 'partial' },
                ],
            },
            {
                id: 'h2',
                label: downstreamLabel,
                confidence: 55,
                why: 'The visible damage is direct — but it may be a consequence of an upstream failure rather than the primary fault.',
                discriminating_question:
                    'Is the visible damage the only thing wrong, with all supporting / balancing components intact?',
                answer_chips: [
                    { id: 'c1', text: 'Yes — the visible damage is the only issue.', effect: 'confirms' },
                    { id: 'c2', text: 'No — something else looks wrong too.', effect: 'rules_out' },
                    { id: 'c3', text: "I'm not sure.", effect: 'partial' },
                ],
            },
        ],
        escape: {
            prompt: "Neither of these matches — tell me what you're seeing.",
        },
    };

    parsed.diagnosis = upstreamLabel;
    parsed.requires_clarification = true;
    parsed.confidence = Math.min(Number(parsed.confidence ?? 75), 75);

    // Mirror legacy flat field so the UI's fallback path also has content.
    parsed.clarification_questions =
        parsed.structured_clarification?.hypotheses[0]?.answer_chips.map((c) => c.text) ?? [];
}

/**
 * Coerce a committed diagnosis when the model produced an internally
 * inconsistent clarification state. Specifically: requires_clarification=true
 * BUT no structured_clarification AND no clarification_questions AND a
 * specific (non-placeholder) title AND high confidence (≥85). In that case
 * the model intended to commit; we honour the commitment.
 *
 * Without this fix, the UI shows the legacy "Need More Information" header
 * with a generic A/B/C/D fallback because requires_clarification=true gates
 * the clarification UX but there's nothing concrete to ask. Caught on the
 * 27 May corroded-geyser test.
 */
function coerceCommitWhenInconsistentClarification(parsed: ProseResult): void {
    if (parsed.requires_clarification !== true) return;

    const titleRaw = (parsed.diagnosis ?? '').trim();
    if (!titleRaw) return;
    if (PLACEHOLDER_TITLE_PATTERN.test(titleRaw)) return;

    const conf = typeof parsed.confidence === 'number' ? parsed.confidence : null;
    if (conf === null || conf < 85) return;

    const hasStructured =
        parsed.structured_clarification &&
        Array.isArray(parsed.structured_clarification.hypotheses) &&
        parsed.structured_clarification.hypotheses.length > 0;
    const hasFlatChips =
        Array.isArray(parsed.clarification_questions) &&
        parsed.clarification_questions.length > 0;
    if (hasStructured || hasFlatChips) return;

    // All conditions met — committed diagnosis being mislabelled as needing
    // clarification. Trust the confidence + title.
    parsed.requires_clarification = false;
    console.warn(
        JSON.stringify({
            type: 'agent-prose:coerced-commit',
            reason: 'high_conf_no_clarification_payload',
            title: titleRaw,
            confidence: conf,
        }),
    );
}

/**
 * Synthesizer safety net for the common loophole where the model produces
 * `clarification_questions` (the flat string[] chips) but omits the
 * structured_clarification object. Builds one from the chips + diagnosis
 * title so the UI renders hypothesis cards. Mutates `parsed` in place.
 *
 * No-op when:
 *   - requires_clarification is not true (no clarification needed)
 *   - structured_clarification already exists with ≥2 hypotheses
 *   - no clarification_questions present to use as chip texts
 *
 * The synthesized hypothesis has the diagnosis title as h1.label and the
 * chips become the answer_chips. There is intentionally only ONE hypothesis
 * in this synthesizer — a single-hypothesis card is still much better than
 * the generic A/B/C/D legacy flow. If the model wants TWO hypotheses, it
 * should produce structured_clarification itself.
 */
function synthesizeStructuredClarificationIfMissing(parsed: ProseResult): void {
    const wantsClarification = parsed.requires_clarification === true;
    if (!wantsClarification) return;
    if (
        parsed.structured_clarification &&
        Array.isArray(parsed.structured_clarification.hypotheses) &&
        parsed.structured_clarification.hypotheses.length >= 2
    ) {
        return;
    }
    const chips = Array.isArray(parsed.clarification_questions)
        ? parsed.clarification_questions
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .map((s) => s.trim())
        : [];
    if (chips.length === 0) return;

    const titleRaw = (parsed.diagnosis ?? '').trim();
    const titleIsPlaceholder = !titleRaw || PLACEHOLDER_TITLE_PATTERN.test(titleRaw);
    const hypothesisLabel = titleIsPlaceholder
        ? 'Possible Cause'
        : titleCaseLabel(titleRaw);

    // Discriminating question: prefer one we can pull from the prose. The
    // thought often opens with a focused question or a "the question is X"
    // construction. As a fallback, use a generic but specific phrasing tied
    // to the hypothesis label.
    const discriminatingQuestion = `Which of these best matches what you see for "${hypothesisLabel}"?`;

    parsed.structured_clarification = {
        intro: "Help me lock this in — pick the option that matches what you see.",
        hypotheses: [
            {
                id: 'h1',
                label: hypothesisLabel,
                confidence: typeof parsed.confidence === 'number'
                    ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
                    : 70,
                why:
                    'This is the most likely cause based on the visible evidence and what you have described so far.',
                discriminating_question: discriminatingQuestion,
                answer_chips: chips.slice(0, 4).map((text, idx) => ({
                    id: `c${idx + 1}`,
                    text,
                    // We can't know each chip's effect without prose guidance —
                    // mark as 'partial' so neither side of the hypothesis tree
                    // moves drastically on a tap. The refine step will re-run
                    // Agent 2b with the chip text as additional context.
                    effect: 'partial' as const,
                })),
            },
        ],
        escape: {
            prompt: "None of these match — tell me what you're seeing.",
        },
    };
}

// Soft floor on the `thought` field. The previous value of 120 was rejecting
// most real model outputs (where the model spent its budget on
// `image_observations` and structured fields, leaving the conversational
// `thought` shorter than 120). Lowered to 50 to match the historical
// response-builder.ts threshold and stop the false-positive throws that were
// causing every garage-door case to fall through to FALLBACK_PROSE.
export const MIN_THOUGHT_CHARS = 50;

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
 *     normalises structured_clarification, rewrites placeholder titles, and
 *     derives image_descriptions when missing.
 *
 *   - From v7.4: a thought shorter than MIN_THOUGHT_CHARS is NOT silently
 *     replaced with FALLBACK_PROSE — instead the parser returns a result with
 *     the short thought intact so the CALLER can decide whether to throw or
 *     accept. Use `runProseGeneration` to get the strict throwing behaviour.
 *     This split is what unblocks the 30% silent-fallback bug in production.
 */
export function parseProseResponse(raw: string): ProseResult | null {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) return null;
    let parsed: ProseResult & { structured_clarification?: unknown };
    try {
        parsed = JSON.parse(trimmed) as ProseResult & { structured_clarification?: unknown };
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
    }

    // Coerce thought to string — but DO NOT silently rewrite short thoughts to
    // FALLBACK_PROSE here. That was the root cause of the 30% silent-failure
    // rate: a legitimately short model output got swapped for the "Photo is
    // not clear enough" message before any caller could see it. The caller
    // (`runProseGeneration`) now inspects the thought length and decides
    // whether to throw a ProseGenerationError or accept it.
    if (typeof parsed.thought !== 'string') {
        parsed.thought = '';
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

    // Normalise structured_clarification (new in v7.4). Undefined when missing
    // or unusable; otherwise a typed object with safe defaults.
    const structured = normaliseStructuredClarification(parsed.structured_clarification);
    if (structured) {
        parsed.structured_clarification = structured;
    } else {
        delete (parsed as { structured_clarification?: unknown }).structured_clarification;
    }

    // Derive the backward-compat flat `clarification_questions` from the top
    // hypothesis's chips when the model didn't populate it directly. Lets
    // older UI surfaces keep rendering chips while new surfaces use the
    // structured field.
    if (
        structured &&
        (!Array.isArray(parsed.clarification_questions) ||
            parsed.clarification_questions.length === 0)
    ) {
        parsed.clarification_questions = structured.hypotheses[0]?.answer_chips
            .map((c) => c.text)
            .filter((t) => t.length > 0) ?? [];
    }

    // Rewrite placeholder diagnosis titles to a specific hypothesis label
    // whenever we have one. Even when the model insists on "Unclear - More
    // Detail Needed", the user should see "Broken Torsion Spring (uncertain)"
    // — never a generic message in the diagnosis title slot.
    parsed.diagnosis = normaliseTitle(parsed.diagnosis, structured);

    // Warn when image_descriptions entries are duplicates of each other —
    // implies the model did not actually look at each image. Surfaced as a
    // structured log so we can track frequency and tighten the prompt over
    // time. Does not mutate the response; the duplicates pass through so
    // the UI can still render *something* per image.
    if (Array.isArray(parsed.image_descriptions) && parsed.image_descriptions.length >= 2) {
        const normalised = parsed.image_descriptions.map((s) =>
            typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '',
        );
        const seen = new Map<string, number>();
        const duplicates: Array<{ index: number; mirrors: number; preview: string }> = [];
        normalised.forEach((s, i) => {
            if (s.length === 0) return;
            const firstIdx = seen.get(s);
            if (firstIdx !== undefined) {
                duplicates.push({
                    index: i,
                    mirrors: firstIdx,
                    preview: s.slice(0, 80),
                });
            } else {
                seen.set(s, i);
            }
        });
        if (duplicates.length > 0) {
            console.warn(
                JSON.stringify({
                    type: 'agent-prose:duplicate-image-descriptions',
                    total: parsed.image_descriptions.length,
                    duplicate_count: duplicates.length,
                    duplicates,
                }),
            );
        }
    }

    return parsed;
}

/**
 * Ensure `image_descriptions.length === imageCount` when imageCount >= 2 by
 * deriving missing entries from `image_observations[i].primary_observation`,
 * then back-filling with placeholders so the UI is never blank. Logs loudly
 * when entries had to be back-filled.
 *
 * Mutates and returns the same `prose` object for caller convenience.
 */
export function backfillImageDescriptions(
    prose: ProseResult,
    imageCount: number,
): ProseResult {
    if (imageCount < 2) return prose;
    const existing = Array.isArray(prose.image_descriptions)
        ? [...prose.image_descriptions]
        : [];
    if (existing.length >= imageCount) {
        // Already enough — nothing to backfill.
        return prose;
    }

    const obs = prose.image_observations ?? [];
    const needed = imageCount - existing.length;
    const filledFromObs: Array<{ source: 'observation' | 'placeholder'; text: string }> = [];

    for (let i = existing.length; i < imageCount; i++) {
        const candidate = obs[i]?.primary_observation?.trim();
        if (candidate && candidate.length > 0) {
            existing[i] = candidate;
            filledFromObs.push({ source: 'observation', text: candidate });
        } else {
            const placeholder = `No additional observation for image ${i + 1}.`;
            existing[i] = placeholder;
            filledFromObs.push({ source: 'placeholder', text: placeholder });
        }
    }

    console.warn(
        JSON.stringify({
            type: 'agent-prose:image-descriptions-backfilled',
            image_count: imageCount,
            had: prose.image_descriptions?.length ?? 0,
            needed,
            filled_from_observation: filledFromObs.filter((f) => f.source === 'observation').length,
            filled_with_placeholder: filledFromObs.filter((f) => f.source === 'placeholder').length,
            parsed_observation_count: obs.length,
            parsed_observation_primary_obs_lengths: obs.map((o) =>
                (o.primary_observation ?? '').length,
            ),
        }),
    );

    prose.image_descriptions = existing;
    return prose;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Last-resort soft-fallback prose. Reserved for truly unrecoverable paths
 * where the caller needs *something* renderable rather than a thrown error.
 * Every use of this value MUST be paired with a `console.warn` of type
 * `agent-prose:fallback-fired` so production telemetry shows when and why it
 * fires — historically this fallback was the silent root cause of the 30%
 * "Photo is not clear enough" UX failure.
 */
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
 * Emit the loud structured warning that accompanies every FALLBACK_PROSE use.
 * Exposed as a helper so any path that intentionally returns FALLBACK_PROSE
 * also surfaces the diagnostic context in logs.
 */
function logFallbackFired(detail: Record<string, unknown>): void {
    console.warn(
        JSON.stringify({
            type: 'agent-prose:fallback-fired',
            ...detail,
        }),
    );
}

/**
 * Run the prose generation sub-agent (Agent 2b).
 *
 * Receives the classification result from Agent 2a as locked ground truth.
 * Uses Gemini structured output with `thought` as the first schema key so
 * it streams immediately.
 *
 * THROWS `ProseGenerationError` on:
 *   - empty model response
 *   - JSON parse failure
 *   - model error
 *   - response.text() throwing
 *   - thought shorter than MIN_THOUGHT_CHARS (this was the production silent-fail)
 *
 * The caller decides whether to retry, surface failure, or fall back to
 * `FALLBACK_PROSE` (always paired with the `agent-prose:fallback-fired` log
 * so the fallback can never silently mask a real failure again).
 */
export async function runProseGeneration(params: {
    contents: GeminiContent[];
    classification: ClassificationResult;
    baseSystemInstruction: string;
    isProviderHydration?: boolean;
    /** Number of images passed in contents — used to enforce image_descriptions count. */
    imageCount?: number;
    ctx?: {
        userId?: string | null;
        conversationId?: string | null;
        promptVariant?: PromptVariant | null;
        modelOverride?: string | null;
    };
}): Promise<ProseResult> {
    const effectiveModel = params.ctx?.modelOverride || GEMINI_MODEL_NAME;
    const variant = resolveVariant({
        override: params.ctx?.promptVariant,
        model: effectiveModel,
    });
    const variantCtx = { variant };
    const stepStart = Date.now();
    // Mock branch — used by Playwright E2E to avoid real Gemini calls.
    // Returns a deterministic, schema-valid prose payload aligned with the mocked
    // Plumbing/geyser classification used by the homeowner golden-path spec.
    if (process.env.MOCK_LLM === '1') {
        const mock: ProseResult = {
            thought:
                'The description reports the geyser is leaking from the pressure relief valve. This is a classic sign that the safety valve is venting either because the cylinder is over-pressurised or the valve itself has perished. Either way, water is escaping where it should not. The fault is mechanical and well within standard plumbing scope.',
            diagnosis: 'Geyser Pressure Relief Valve Leak',
            estimated_diagnosis_sentence:
                'A leaking geyser pressure relief valve, typically caused by valve wear or excess cylinder pressure.',
            message:
                'Your geyser pressure relief valve is leaking, which usually means the valve has perished or the cylinder is over-pressurised. A licensed plumber can replace the valve and confirm the cylinder is operating within safe pressure.\n\nIf water is pooling, switch off the geyser at the DB board and shut the cold-water inlet until a plumber arrives.',
            action_required: '',
            contractor_checklist: [
                'Replace the pressure relief (T&P) valve.',
                'Test cylinder operating pressure against rated spec.',
                'Inspect the expansion vessel if fitted.',
                'Check the geyser drip tray and overflow run for damage.',
            ],
            homeowner_prep:
                'Switch the geyser off at the DB board and close the cold inlet stop-cock if you can reach it safely.',
            image_descriptions: [],
            image_observations: [],
            diy_verification: '',
            photo_request: '',
            confidence_drivers: [
                'Classic relief-valve leak symptom',
                'No alternative cause indicated in description',
            ],
        };
        logPipelineStep({
            stepName: 'agent-prose', status: 'ok', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: 'mock-llm',
        });
        return mock;
    }

    const imageCount = typeof params.imageCount === 'number' ? params.imageCount : 0;

    let raw: string = '';
    let finishReason: string | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    try {
        const baseModel = getDiagnosisModelByName(params.ctx?.modelOverride);

        const sampling = getProseSamplingParams(variantCtx, {
            isProviderHydration: Boolean(params.isProviderHydration),
        });

        // ── Prose system-prompt context caching (cost-cut Deliverable 2) ──
        // The v3.5-native prose system prompt is ~12K tokens of mostly-static
        // protocol/concision/user-cause rules plus a small dynamic injection
        // (locked-in classification block + optional clarification-guidance).
        // On gemini-3.5-flash the cached-input rate ($0.15/1M) is 10× cheaper
        // than the regular rate ($1.50/1M), so caching the static portion
        // takes ~90% off the input cost for the prose call.
        //
        // Gated on:
        //   • variant === 'v3.5-native' (static/dynamic split only exists here)
        //   • effective prose model is gemini-3.5-flash (the rate gap is what
        //     makes caching worthwhile; other models don't have the same
        //     spread).
        //   • GEMINI_CACHE_ENABLED env not explicitly '0' (matches the
        //     classify cache off-switch).
        // On any failure (minimum cache size violation, API error, etc.) the
        // helper returns null and we fall through to the un-cached call with
        // the full system prompt — identical behaviour to today.
        const proseEffectiveModel = params.ctx?.modelOverride || GEMINI_MODEL_NAME;
        const cacheEnabled =
            process.env.GEMINI_CACHE_ENABLED !== '0' &&
            variantCtx.variant === 'v3.5-native' &&
            proseEffectiveModel === 'gemini-3.5-flash';
        const cachedContentName = cacheEnabled
            ? await getOrCreateCachedSystemPrompt({
                  model: `models/${proseEffectiveModel}`,
                  systemInstruction: buildProseSystemPrompt_v35_native_static(),
                  ttlSeconds: 3600,
              })
            : null;

        // When cached, pass the dynamic block as the FIRST user-role message
        // (system instruction is already in the cache; passing it again would
        // override the cache). When not cached, build the full system prompt
        // via the resolver as before.
        const dynamicSystemBlock =
            cachedContentName && variantCtx.variant === 'v3.5-native'
                ? buildProseSystemPrompt_v35_native_dynamic(
                      params.classification,
                      params.baseSystemInstruction,
                  )
                : null;
        const fullSystemPrompt = cachedContentName
            ? null
            : getProseSystemPrompt(
                  params.classification,
                  params.baseSystemInstruction,
                  variantCtx,
              );

        // When images were supplied, tell the model exactly how many descriptions to produce
        // and instruct it to look specifically for absent/detached components in each image.
        const imageInstruction =
            imageCount > 0
                ? ` ${imageCount} image${imageCount > 1 ? 's were' : ' was'} provided — image_descriptions MUST contain exactly ${imageCount} entries, one per image in order. For each image, explicitly name the components visible AND name at least one feature visible ONLY in THAT image (the side, angle, close-up detail, or component that distinguishes it from the others). Call out any part that is MISSING, detached, or asymmetric (e.g. a spring present on one side but absent on the other, a bent connecting rod, a displaced bracket). Never copy-paste between entries — repetition across images is a diagnostic failure.${
                      imageCount > 1
                          ? ' Apply the MULTI-IMAGE SYNTHESIS PROTOCOL described in the system prompt.'
                          : ''
                  }`
                : '';

        const proseContents: GeminiContent[] = [
            // When cached, surface the per-call dynamic portion as the first
            // user-role message so the model sees the locked-in classification
            // alongside the cached protocol.
            ...(dynamicSystemBlock
                ? [
                      {
                          role: 'user' as const,
                          parts: [{ text: dynamicSystemBlock }],
                      },
                  ]
                : []),
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

        const ai = getGenAiClient();
        const geminiStartedAt = Date.now();
        const result = await ai.models.generateContent({
            model: baseModel.model,
            contents: proseContents,
            config: {
                // Sampling params come from the variant resolver. The v2.5
                // values match the historically tuned numbers
                // (temperature 0.22/0.35, topP 0.8, topK 40, maxOutputTokens
                // 4000); v3.5 currently delegates to v2.5 until Session 3+
                // tuning diverges them. See prompts/variants/prompt-variant.ts.
                ...sampling,
                responseMimeType: 'application/json',
                responseSchema: PROSE_SCHEMA,
                // Gemini 2.5 Flash native reasoning — improves diagnostic accuracy and visual
                // grounding without surfacing thinking text to the homeowner. The thought field
                // in the schema is a purpose-built 2–3 sentence homeowner-facing explanation;
                // thinkingBudget improves the quality of that field and all other fields.
                // Budget of 1024 balances output quality gain against per-call latency.
                thinkingConfig: { thinkingBudget: 1024 },
                // Only set systemInstruction when NOT using cachedContent — the
                // cache already carries it, and overriding here defeats the cache.
                ...(cachedContentName
                    ? { cachedContent: cachedContentName }
                    : fullSystemPrompt
                      ? { systemInstruction: fullSystemPrompt }
                      : {}),
            },
        });

        const usage = result.usageMetadata;
        promptTokens = usage?.promptTokenCount;
        completionTokens = usage?.candidatesTokenCount;
        finishReason =
            (result.candidates && result.candidates[0]?.finishReason) ||
            undefined;

        // Fire-and-forget cost log — never blocks the response
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/prose',
            modelName: effectiveModel,
            userId: params.ctx?.userId,
            conversationId: params.ctx?.conversationId,
            latencyMs: Date.now() - geminiStartedAt,
        });

        try {
            raw = (result.text ?? '').trim();
        } catch (texErr) {
            console.error('[agent-prose] response.text() failed', texErr);
            logPipelineStep({
                stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
                conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
                modelName: effectiveModel, errorMessage: 'response.text() threw',
                promptTokens, completionTokens,
            });
            throw new ProseGenerationError(
                'response_text_threw',
                `response.text() threw: ${texErr instanceof Error ? texErr.message : String(texErr)}`,
                { finishReason, promptTokens, completionTokens, cause: texErr },
            );
        }
    } catch (e) {
        if (e instanceof ProseGenerationError) throw e;
        console.error('[agent-prose] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: effectiveModel,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new ProseGenerationError(
            'model_threw',
            `Gemini generateContent threw: ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
        );
    }

    if (!raw) {
        console.error('[agent-prose] empty model text', { finishReason });
        logPipelineStep({
            stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: effectiveModel, errorMessage: 'empty model text',
            promptTokens, completionTokens,
        });
        throw new ProseGenerationError(
            'empty_response',
            'Gemini returned an empty response body',
            { finishReason, promptTokens, completionTokens, rawExcerpt: '' },
        );
    }

    const parsed = parseProseResponse(raw);
    if (!parsed) {
        console.error('[agent-prose] JSON parse failed', raw.slice(0, 600));
        logPipelineStep({
            stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: effectiveModel, errorMessage: 'JSON parse failed',
            promptTokens, completionTokens,
        });
        throw new ProseGenerationError(
            'parse_failed',
            'Gemini response could not be parsed as JSON',
            { finishReason, promptTokens, completionTokens, rawExcerpt: raw.slice(0, 600) },
        );
    }

    // Enforce the minimum thought length. Previously this triggered a silent
    // FALLBACK_PROSE substitution in the parser — the production root cause
    // of "Photo is not clear enough for a confident diagnosis" firing on 30%
    // of diagnoses. We now throw so the caller decides what to do.
    const thoughtLen = (parsed.thought ?? '').trim().length;
    if (thoughtLen < MIN_THOUGHT_CHARS) {
        console.error('[agent-prose] thought too short', {
            length: thoughtLen,
            min: MIN_THOUGHT_CHARS,
            finishReason,
            excerpt: (parsed.thought ?? '').slice(0, 120),
        });
        logPipelineStep({
            stepName: 'agent-prose', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
            modelName: effectiveModel,
            errorMessage: `thought shorter than ${MIN_THOUGHT_CHARS} chars (got ${thoughtLen})`,
            promptTokens, completionTokens,
        });
        throw new ProseGenerationError(
            'short_thought',
            `Model produced a thought of only ${thoughtLen} chars (minimum ${MIN_THOUGHT_CHARS}).`,
            {
                finishReason,
                promptTokens,
                completionTokens,
                rawExcerpt: raw.slice(0, 600),
                parsed,
            },
        );
    }

    // Backfill image_descriptions when the model under-produced (one of the
    // top three production failure modes — 91% of multi-image diagnoses had
    // zero or short image_descriptions).
    if (imageCount >= 2) {
        backfillImageDescriptions(parsed, imageCount);
    }

    // Thought-title disconnect safety net. When the model identifies an
    // upstream cause in its reasoning but commits a downstream-symptom title
    // anyway (the missing-spring failure mode caught on the 21:27 garage door
    // test), this forces a structured_clarification with the upstream cause
    // and the visible damage as competing hypotheses — letting the user
    // resolve instead of letting a wrong title slip through.
    applyThoughtTitleDisconnectRewrite(parsed);

    // Synthesizer safety net: when the model emitted clarification_questions
    // but NO structured_clarification (a common "loophole" — the schema
    // doesn't make structured_clarification top-level required), build one
    // so the UI renders hypothesis cards instead of falling back to the
    // legacy "Which option best questions…" flow with one generic prompt.
    synthesizeStructuredClarificationIfMissing(parsed);

    // Inconsistent-clarification fix: caught on the 27 May corroded-geyser
    // test. The model set requires_clarification=true while ALSO setting
    // confidence 98, a specific non-placeholder title, and a named
    // failed_component — but produced no clarification_questions and no
    // structured_clarification. That's an internally inconsistent state
    // (probably the cause-hierarchy prompt rule being over-applied on a
    // case where the model actually had direct evidence). The UI sees
    // requires_clarification=true and falls back to the legacy generic
    // A/B/C/D chips, which is the worst outcome.
    //
    // Resolution: when the model is plainly confident (≥85) AND has
    // nothing concrete to clarify (no structured + no flat chips) AND
    // produced a specific title (not a placeholder), trust the
    // confidence and flip requires_clarification back to false. The
    // user can refine if they disagree.
    coerceCommitWhenInconsistentClarification(parsed);

    // Audit whether the model performed the mandatory symmetry-enumeration
    // and cause-hierarchy checks introduced after the missing-spring incident.
    // The rules force the model to write specific marker phrases in `thought`
    // ("Comparing the two sides:" / "Symmetry check:" / "Cause-hierarchy
    // check:" / "Considering upstream causes:"). When those markers are
    // absent on a multi-image diagnosis committing on downstream-symptom
    // damage (bent / detached / off-track / sagging / sheared), write an
    // audit row so we can see in production whether the model is actually
    // applying the new rules. Fire-and-forget, no behaviour change here.
    if (imageCount >= 2) {
        void auditSymmetryAndCauseHierarchyChecks(parsed, params.ctx?.conversationId);
    }

    logPipelineStep({
        stepName: 'agent-prose', status: 'ok', durationMs: Date.now() - stepStart,
        conversationId: params.ctx?.conversationId, userId: params.ctx?.userId,
        modelName: effectiveModel,
        promptTokens, completionTokens,
    });
    return parsed;
}

const SYMMETRY_CHECK_MARKERS =
    /\b(symmetry check|comparing the two sides|comparing the (left|right|top|bottom) side|both sides|each side|side by side|left vs right|top vs bottom|no bilateral symmetry)\b/i;

const CAUSE_HIERARCHY_MARKERS =
    /\b(cause[- ]hierarchy check|considering upstream causes?|upstream cause|downstream (symptom|effect)|primary failure|root cause)\b/i;

const DOWNSTREAM_SYMPTOM_LABELS =
    /\b(bent|detached|fallen|sagging|off[- ]?track|misaligned|skewed|deformed|sheared|snapped|hanging|torn)\b/i;

/**
 * Fire-and-forget audit: writes a row to audit_logs when the model skipped
 * the symmetry-enumeration or cause-hierarchy markers despite committing a
 * downstream-symptom diagnosis. Never throws, never blocks.
 */
async function auditSymmetryAndCauseHierarchyChecks(
    parsed: ProseResult,
    conversationId: string | null | undefined,
): Promise<void> {
    try {
        const thought = (parsed.thought ?? '').toString();
        const diagnosisTitle = (parsed.diagnosis ?? '').toString();

        const symmetryOk = SYMMETRY_CHECK_MARKERS.test(thought);
        const causeHierarchyOk = CAUSE_HIERARCHY_MARKERS.test(thought);
        const titleIsDownstreamSymptom = DOWNSTREAM_SYMPTOM_LABELS.test(diagnosisTitle);

        // Only audit cases that committed with downstream-symptom language and
        // did NOT produce a structured_clarification. structured_clarification
        // implies the cause-hierarchy check was performed (the model
        // surfaced multiple hypotheses), so no audit needed there.
        const committedOnDownstreamSymptom =
            titleIsDownstreamSymptom && !parsed.structured_clarification;

        if (!committedOnDownstreamSymptom) return;
        if (symmetryOk && causeHierarchyOk) return;

        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        const admin = await createSupabaseAdminClient();
        await admin.from('audit_logs').insert({
            event_type: 'DIAGNOSTIC',
            action: 'agent_prose_skipped_required_checks',
            entity_type: 'diagnosis',
            entity_id: conversationId ?? null,
            payload: {
                missing_symmetry_marker: !symmetryOk,
                missing_cause_hierarchy_marker: !causeHierarchyOk,
                diagnosis_title: diagnosisTitle,
                thought_excerpt: thought.slice(0, 600),
            },
        });
    } catch (e) {
        console.warn(
            JSON.stringify({
                type: 'agent-prose:audit-skip-write-failed',
                err: e instanceof Error ? e.message : String(e),
            }),
        );
    }
}

/**
 * Build a soft-fallback ProseResult for callers that want to recover from a
 * thrown `ProseGenerationError` without surfacing a 500 to the user.
 *
 * Always logged loudly with `agent-prose:fallback-fired` so the fallback can
 * never silently mask a real failure (the production root cause of the 30%
 * silent-fallback rate this v7.4 patch fixes).
 */
export function buildSoftFallbackProse(detail: {
    reason: string;
    error?: unknown;
    conversationId?: string | null;
}): ProseResult {
    logFallbackFired({
        reason: detail.reason,
        error_kind:
            detail.error instanceof ProseGenerationError ? detail.error.kind : undefined,
        error_message:
            detail.error instanceof Error ? detail.error.message : undefined,
        conversationId: detail.conversationId,
    });
    // Also persist the failure to audit_logs so it's queryable via the
    // Supabase MCP. Fire-and-forget; never blocks. This is the diagnostic
    // signal we use to figure out *which* parser check is rejecting model
    // output (short_thought / parse_failed / schema_mismatch / ...). Without
    // this row, we cannot tell from production data alone.
    void persistProseFailureForDiagnostics(detail);
    return { ...FALLBACK_PROSE, requestFailed: true };
}

async function persistProseFailureForDiagnostics(detail: {
    reason: string;
    error?: unknown;
    conversationId?: string | null;
}): Promise<void> {
    try {
        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        const admin = await createSupabaseAdminClient();
        const err = detail.error instanceof ProseGenerationError ? detail.error : null;
        const payload: Record<string, unknown> = {
            reason: detail.reason,
            error_kind: err?.kind ?? null,
            error_message:
                detail.error instanceof Error ? detail.error.message : null,
            // The structured detail blob the error carried (parsed model output,
            // finish_reason, token counts, raw response excerpt). This is the
            // key signal for diagnosing why Agent 2b is failing.
            error_detail: (err?.detail as Record<string, unknown> | undefined) ?? null,
            conversation_id: detail.conversationId ?? null,
        };
        await admin.from('audit_logs').insert({
            event_type: 'DIAGNOSTIC',
            action: 'agent_prose_fallback_fired',
            entity_type: 'diagnosis',
            entity_id: detail.conversationId ?? null,
            payload,
        });
    } catch (e) {
        console.warn(
            JSON.stringify({
                type: 'agent-prose:audit-log-write-failed',
                err: e instanceof Error ? e.message : String(e),
            }),
        );
    }
}

/**
 * Normalise prose result fields to match the style rules enforced by
 * the legacy post-processing pipeline (toHeadlineStyle, stripFillerSentenceStarts).
 * Keeps parity with old single-agent behaviour without regex on raw model text.
 */
export function normaliseProse(prose: ProseResult): ProseResult {
    // Re-apply the title normaliser after style coercion so the headline
    // pass doesn't accidentally produce something that matches the
    // placeholder pattern (e.g. "Unclear More Detail Needed" with no hyphen).
    const styledDiagnosis = toHeadlineStyle(prose.diagnosis);
    const finalDiagnosis = normaliseTitle(styledDiagnosis, prose.structured_clarification);
    return {
        ...prose,
        diagnosis: finalDiagnosis,
        // estimated_diagnosis_sentence is no longer in the model schema — derive server-side.
        estimated_diagnosis_sentence: finalDiagnosis,
        trade_detail: undefined, // not prose's field
        action_required: stripFillerSentenceStarts(prose.action_required),
        ...(prose.requestFailed ? { requestFailed: true as const } : {}),
    } as ProseResult;
}
