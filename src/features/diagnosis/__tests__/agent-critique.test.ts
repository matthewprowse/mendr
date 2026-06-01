/**
 * Phase 2 — runCritique adapter tests.
 *
 * Covers the spec-aligned entrypoint in `agent-critique.ts`:
 *   1. Returns null (not throw) when the env flag is OFF.
 *   2. Mocks Gemini to return a known critique JSON on a textbook
 *      garage-door-spring case and asserts the parsed shape.
 *   3. Preserves `critique_confidence > agent_confidence` end-to-end.
 *
 * No real Gemini calls. The diagnosis-model module is mocked so the
 * `generateContent` surface is fully controlled by the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content as GeminiContent } from '@google/generative-ai';
import { runCritique } from '@/features/diagnosis/agent-critique';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import type { ProseResult } from '@/features/diagnosis/agent-prose';

// ── Mock the Gemini-facing modules ────────────────────────────────────────────
//
// We mock at the diagnosis-backend boundary because that is what
// `runDiagnosisCritique` imports. `logGeminiUsage` and `logAiCall` are
// side-effect-only and safe to leave as real, but we keep them quiet by
// stubbing them.

const generateContent = vi.fn();
vi.mock('@/lib/ai/ai-diagnosis-backend', () => ({
    // Both constants exposed: main pipeline uses GEMINI_MODEL_NAME,
    // Agent 3 uses GEMINI_CRITIQUE_MODEL_NAME. Tests for Agent 3 only
    // need the critique model factory; we keep the diagnosis one for
    // any sibling test that imports this mock.
    GEMINI_MODEL_NAME: 'gemini-2.5-flash',
    GEMINI_CRITIQUE_MODEL_NAME: 'gemini-2.5-flash',
    getDiagnosisModel: () => ({ generateContent }),
    getCritiqueModel: () => ({ generateContent }),
}));
vi.mock('@/lib/ai/ai-cost-logger', () => ({
    logGeminiUsage: vi.fn(),
}));
vi.mock('@/lib/ai/ai-call-logger', () => ({
    logAiCall: vi.fn(),
    textifyGeminiContents: () => 'mock-prompt-text',
}));

// ── Fixture: textbook garage-door torsion-spring case ─────────────────────────

const GARAGE_DOOR_CONTENTS: GeminiContent[] = [
    {
        role: 'user',
        parts: [
            {
                text: 'My garage door opens partially and cannot close. The spring is missing on one side.',
            },
        ],
    },
];

const GARAGE_DOOR_CLASSIFICATION: ClassificationResult = {
    trade: 'Security',
    trade_detail: 'Garage Door Fault / Repair',
    subcategory_id: 'garage_door_fault',
    confidence: 60,
    rejected: false,
    requires_clarification: true,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
    failed_component: 'torsion spring',
    cascading_damage: '',
    trade_candidates: [],
};

const GARAGE_DOOR_PROSE: ProseResult = {
    thought:
        'User describes a partially-opening garage door with a missing spring on one side. Torsion-spring failure is the classical fault for that symptom; the model nevertheless scored 60 and asked for clarification rather than committing.',
    diagnosis: 'Unclear — More Detail Needed',
    estimated_diagnosis_sentence: 'Possibly a broken torsion spring.',
    message: 'Need more context before we can give a confident diagnosis.',
    action_required: 'Provide more detail.',
    contractor_checklist: [],
    homeowner_prep: '',
    image_descriptions: [],
    image_observations: [],
    diy_verification: '',
    photo_request: '',
    confidence_drivers: [],
};

// ── Mocked critique response from Gemini ──────────────────────────────────────

const MOCK_GEMINI_CRITIQUE = {
    failure_mode: 'rubric_miscalibration',
    confidence_calibration: {
        agent_confidence: 60,
        critique_confidence: 90,
        delta_reasoning:
            'User named the failed component explicitly ("spring missing on one side"). Symptom — partial open and inability to close — uniquely implicates a torsion spring failure. The integer rubric in `output-format.ts` has no anchor for text-only confident cases, so the model defaulted to the conservative side of the 85 threshold.',
        rubric_facets_used: ['component_named', 'symptom_unique', 'description_complete'],
    },
    knowledge_gap: '',
    resolution_would_be: '',
    considered_alternatives: ['Snapped lifting cable', 'Opener motor over-current cutout'],
    surprise_signals: [
        'User stated the spring is missing on one side — single-side absence is a primary fault signal even without an image',
    ],
    prompt_hypothesis: 'output-format.ts:confidence_definition',
    notes_for_human_review:
        'Classic garage-door pattern: text-only complete description, model under-scored confidence. Phase 5 rubric should add an explicit text-only confident-case anchor.',
};

function makeGenerateContentResult(payload: object) {
    const text = JSON.stringify(payload);
    return {
        response: {
            text: () => text,
            usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 80,
                totalTokenCount: 180,
            },
        },
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runCritique — env flag gating', () => {
    const originalA3 = process.env.DIAGNOSIS_AGENT_3_ENABLED;
    const originalLegacy = process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
    const originalMock = process.env.MOCK_LLM;

    beforeEach(() => {
        delete process.env.DIAGNOSIS_AGENT_3_ENABLED;
        delete process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
    });

    afterEach(() => {
        if (originalA3 === undefined) delete process.env.DIAGNOSIS_AGENT_3_ENABLED;
        else process.env.DIAGNOSIS_AGENT_3_ENABLED = originalA3;
        if (originalLegacy === undefined) delete process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
        else process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED = originalLegacy;
        if (originalMock === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = originalMock;
    });

    it('returns null when the env flag is OFF and does not throw', async () => {
        const result = await runCritique({
            contents: GARAGE_DOOR_CONTENTS,
            classification: GARAGE_DOOR_CLASSIFICATION,
            prose: GARAGE_DOOR_PROSE,
            conversationId: '00000000-0000-0000-0000-000000000001',
            userId: null,
        });
        expect(result).toBeNull();
        // Critically: Gemini was never called.
        expect(generateContent).not.toHaveBeenCalled();
    });
});

describe('runCritique — mocked Gemini on the garage-door fixture', () => {
    const originalA3 = process.env.DIAGNOSIS_AGENT_3_ENABLED;
    const originalLegacy = process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
    const originalMock = process.env.MOCK_LLM;

    beforeEach(() => {
        process.env.DIAGNOSIS_AGENT_3_ENABLED = '1';
        delete process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
        // MOCK_LLM short-circuits to a static critique inside runDiagnosisCritique
        // — we want the real Gemini path so our mock is exercised.
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
        generateContent.mockResolvedValue(
            makeGenerateContentResult(MOCK_GEMINI_CRITIQUE),
        );
    });

    afterEach(() => {
        if (originalA3 === undefined) delete process.env.DIAGNOSIS_AGENT_3_ENABLED;
        else process.env.DIAGNOSIS_AGENT_3_ENABLED = originalA3;
        if (originalLegacy === undefined) delete process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
        else process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED = originalLegacy;
        if (originalMock === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = originalMock;
    });

    it("parses failure_mode: 'rubric_miscalibration' correctly", async () => {
        const result = await runCritique({
            contents: GARAGE_DOOR_CONTENTS,
            classification: GARAGE_DOOR_CLASSIFICATION,
            prose: GARAGE_DOOR_PROSE,
            conversationId: '00000000-0000-0000-0000-000000000001',
            userId: null,
        });
        expect(result).not.toBeNull();
        expect(result?.failure_mode).toBe('rubric_miscalibration');
    });

    it('preserves critique_confidence > agent_confidence end-to-end', async () => {
        const result = await runCritique({
            contents: GARAGE_DOOR_CONTENTS,
            classification: GARAGE_DOOR_CLASSIFICATION,
            prose: GARAGE_DOOR_PROSE,
            conversationId: '00000000-0000-0000-0000-000000000001',
            userId: null,
        });
        expect(result).not.toBeNull();
        const cc = result!.confidence_calibration;
        expect(cc.agent_confidence).toBe(60);
        expect(cc.critique_confidence).toBe(90);
        expect(cc.critique_confidence).toBeGreaterThan(cc.agent_confidence);
    });

    it('passes the classification + prose through to Gemini as part of the prompt', async () => {
        await runCritique({
            contents: GARAGE_DOOR_CONTENTS,
            classification: GARAGE_DOOR_CLASSIFICATION,
            prose: GARAGE_DOOR_PROSE,
            conversationId: '00000000-0000-0000-0000-000000000001',
            userId: null,
        });
        expect(generateContent).toHaveBeenCalledTimes(1);
        const args = generateContent.mock.calls[0][0] as {
            contents: GeminiContent[];
        };
        // The agent outputs are appended as a final user turn after the
        // original contents; assert the trade and failed_component appear.
        const lastTurn = args.contents[args.contents.length - 1];
        const lastText = (lastTurn.parts as Array<{ text?: string }>)
            .map((p) => p.text ?? '')
            .join('\n');
        expect(lastText).toContain('garage_door_fault');
        expect(lastText).toContain('torsion spring');
    });
});

describe('runCritique — legacy env flag still toggles the agent on', () => {
    const originalA3 = process.env.DIAGNOSIS_AGENT_3_ENABLED;
    const originalLegacy = process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
    const originalMock = process.env.MOCK_LLM;

    beforeEach(() => {
        delete process.env.DIAGNOSIS_AGENT_3_ENABLED;
        process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED = '1';
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
        generateContent.mockResolvedValue(
            makeGenerateContentResult(MOCK_GEMINI_CRITIQUE),
        );
    });

    afterEach(() => {
        if (originalA3 === undefined) delete process.env.DIAGNOSIS_AGENT_3_ENABLED;
        else process.env.DIAGNOSIS_AGENT_3_ENABLED = originalA3;
        if (originalLegacy === undefined) delete process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED;
        else process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED = originalLegacy;
        if (originalMock === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = originalMock;
    });

    it('runs the critique when only the legacy flag is set', async () => {
        const result = await runCritique({
            contents: GARAGE_DOOR_CONTENTS,
            classification: GARAGE_DOOR_CLASSIFICATION,
            prose: GARAGE_DOOR_PROSE,
            conversationId: '00000000-0000-0000-0000-000000000001',
            userId: null,
        });
        expect(generateContent).toHaveBeenCalled();
        expect(result?.failure_mode).toBe('rubric_miscalibration');
    });
});
