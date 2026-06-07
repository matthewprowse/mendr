/**
 * v7.4 — Agent 2b strict error path tests.
 *
 * The production root cause for the 30% "Photo is not clear enough" silent
 * failure was the parser silently rewriting any short thought to
 * FALLBACK_PROSE.thought. The new contract: `runProseGeneration` THROWS a
 * `ProseGenerationError` on legitimate failures (empty response, parse
 * failure, schema mismatch, short thought, model errors). The caller chooses
 * whether to retry, surface failure, or call `buildSoftFallbackProse` for a
 * loudly-logged last-resort.
 *
 * These tests mock the Gemini model boundary so we exercise the entire
 * `runProseGeneration` body without making real network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    ProseGenerationError,
    buildSoftFallbackProse,
    FALLBACK_PROSE,
    MIN_THOUGHT_CHARS,
} from '../agent-prose';
import type { ClassificationResult } from '../agent-classify';

// ── Module mocks ────────────────────────────────────────────────────────────

const generateContent = vi.fn();

// New @google/genai SDK: model handle is { client, model } but agent-prose
// calls getGenAiClient() directly for the actual API call.
vi.mock('@/lib/ai/ai-diagnosis-backend', () => ({
    GEMINI_MODEL_NAME: 'gemini-2.5-flash-test',
    getDiagnosisModel: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash-test' }),
    getDiagnosisModelByName: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash-test' }),
}));
// Also mock the ai-client so getGenAiClient() returns our fake
vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
    GEMINI_MODEL_NAME: 'gemini-2.5-flash-test',
    GEMINI_CRITIQUE_MODEL_NAME: 'gemini-2.5-flash-test',
    GEMINI_ENRICHMENT_MODEL_NAME: 'gemini-2.5-flash-test',
    getDiagnosisModel: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash-test' }),
    getDiagnosisModelByName: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash-test' }),
}));

vi.mock('@/lib/ai/ai-cost-logger', () => ({
    logGeminiUsage: vi.fn(),
}));

vi.mock('@/lib/ai/ai-logging', () => ({
    logPipelineStep: vi.fn(),
    logAiEvent: vi.fn(),
}));

const classification: ClassificationResult = {
    trade: 'Security',
    trade_detail: 'Garage Door Repair',
    subcategory_id: 'garage_door_fault',
    confidence: 65,
    rejected: false,
    requires_clarification: true,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
    failed_component: '',
    cascading_damage: '',
    trade_candidates: [],
};

function mockGeminiResponse(text: string, finishReason = 'STOP') {
    // New @google/genai SDK: text is a property, usageMetadata is top-level
    generateContent.mockResolvedValueOnce({
        text,
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
        candidates: [{ finishReason }],
    });
}

function mockGeminiThrows(err: unknown) {
    generateContent.mockRejectedValueOnce(err);
}

function mockGeminiResponseTextThrows() {
    // New SDK: text is a property not a method — simulate a getter that throws
    generateContent.mockResolvedValueOnce(
        Object.defineProperty(
            {
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
                candidates: [{ finishReason: 'SAFETY' }],
            },
            'text',
            { get() { throw new Error('SDK exploded inside text()'); }, configurable: true },
        ),
    );
}

// Long thought (>= MIN_THOUGHT_CHARS = 120 chars) used for happy-path tests.
const LONG_THOUGHT =
    'The visible asymmetry between the two torsion springs is a strong indicator of a snapped left spring. The bracket shows only the mounting collar with no coil between it and the centre cone. The right spring is seated and intact. No alternative cause is visible.';

const WELL_FORMED_RAW = JSON.stringify({
    thought: LONG_THOUGHT,
    diagnosis: 'Broken Torsion Spring',
    message: 'Your left torsion spring has snapped and the door is unsafe to use.',
    action_required: '',
    contractor_checklist: ['Replace both springs as a matched pair.'],
    homeowner_prep: 'Keep the door closed until the contractor arrives.',
    image_descriptions: [],
    image_observations: [],
    clarification_questions: [],
    diy_verification: '',
    photo_request: '',
    confidence_drivers: ['Clear asymmetric view', 'Description matches damage'],
});

describe('runProseGeneration — error contract', () => {
    const originalMock = process.env.MOCK_LLM;

    beforeEach(() => {
        // Disable MOCK_LLM so we exercise the real Gemini-mocked path.
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
    });

    afterEach(() => {
        if (originalMock !== undefined) process.env.MOCK_LLM = originalMock;
        vi.restoreAllMocks();
    });

    it('throws ProseGenerationError(empty_response) when Gemini returns empty text', async () => {
        mockGeminiResponse('');
        const { runProseGeneration } = await import('../agent-prose');
        await expect(
            runProseGeneration({
                contents: [],
                classification,
                baseSystemInstruction: '',
            }),
        ).rejects.toMatchObject({
            name: 'ProseGenerationError',
            kind: 'empty_response',
        });
    });

    it('throws ProseGenerationError(parse_failed) when Gemini returns non-JSON', async () => {
        mockGeminiResponse('I am sorry, I cannot help with that.');
        const { runProseGeneration } = await import('../agent-prose');
        try {
            await runProseGeneration({
                contents: [],
                classification,
                baseSystemInstruction: '',
            });
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ProseGenerationError);
            const err = e as ProseGenerationError;
            expect(err.kind).toBe('parse_failed');
            expect(err.detail.rawExcerpt).toContain('cannot help');
            expect(err.detail.promptTokens).toBe(100);
        }
    });

    it('throws ProseGenerationError(short_thought) and INCLUDES the parsed payload in detail', async () => {
        const rawShortThought = JSON.stringify({
            thought: 'too short',
            diagnosis: 'Broken Torsion Spring',
            message: 'A short message.',
            action_required: '',
            contractor_checklist: [],
            homeowner_prep: '',
            image_descriptions: [],
            image_observations: [],
            clarification_questions: [],
            diy_verification: '',
            photo_request: '',
            confidence_drivers: [],
        });
        mockGeminiResponse(rawShortThought);
        const { runProseGeneration } = await import('../agent-prose');
        try {
            await runProseGeneration({
                contents: [],
                classification,
                baseSystemInstruction: '',
            });
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ProseGenerationError);
            const err = e as ProseGenerationError;
            expect(err.kind).toBe('short_thought');
            expect(err.message).toContain(String(MIN_THOUGHT_CHARS));
            // The parsed payload is preserved so the caller can decide whether
            // to use the rest of the structured output.
            expect(err.detail.parsed).toBeTruthy();
            expect(err.detail.parsed?.diagnosis).toBe('Broken Torsion Spring');
        }
    });

    it('throws ProseGenerationError(response_text_threw) when response.text() throws', async () => {
        mockGeminiResponseTextThrows();
        const { runProseGeneration } = await import('../agent-prose');
        try {
            await runProseGeneration({
                contents: [],
                classification,
                baseSystemInstruction: '',
            });
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ProseGenerationError);
            const err = e as ProseGenerationError;
            expect(err.kind).toBe('response_text_threw');
            expect(err.detail.finishReason).toBe('SAFETY');
        }
    });

    it('throws ProseGenerationError(model_threw) when generateContent itself rejects', async () => {
        mockGeminiThrows(new Error('500 Internal'));
        const { runProseGeneration } = await import('../agent-prose');
        try {
            await runProseGeneration({
                contents: [],
                classification,
                baseSystemInstruction: '',
            });
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ProseGenerationError);
            const err = e as ProseGenerationError;
            expect(err.kind).toBe('model_threw');
            expect(err.message).toContain('500 Internal');
        }
    });

    it('does NOT throw on the happy path — returns the parsed ProseResult', async () => {
        mockGeminiResponse(WELL_FORMED_RAW);
        const { runProseGeneration } = await import('../agent-prose');
        const out = await runProseGeneration({
            contents: [],
            classification,
            baseSystemInstruction: '',
        });
        expect(out.diagnosis).toBe('Broken Torsion Spring');
        expect(out.thought.length).toBeGreaterThanOrEqual(MIN_THOUGHT_CHARS);
        expect(out.requestFailed).toBeUndefined();
    });

    it('backfills image_descriptions when image_count >= 2 and the model under-produced', async () => {
        const raw = JSON.stringify({
            thought: LONG_THOUGHT,
            diagnosis: 'Broken Torsion Spring',
            message: 'message',
            action_required: '',
            contractor_checklist: [],
            homeowner_prep: '',
            image_descriptions: ['only first'],
            image_observations: [
                {
                    primary_observation: 'first obs',
                    components_visible: [],
                    components_missing_or_damaged: [],
                    role_in_diagnosis: 'primary_evidence',
                },
                {
                    primary_observation: 'second obs',
                    components_visible: [],
                    components_missing_or_damaged: [],
                    role_in_diagnosis: 'corroborating',
                },
            ],
            clarification_questions: [],
            diy_verification: '',
            photo_request: '',
            confidence_drivers: [],
        });
        mockGeminiResponse(raw);
        const { runProseGeneration } = await import('../agent-prose');
        const out = await runProseGeneration({
            contents: [],
            classification,
            baseSystemInstruction: '',
            imageCount: 3,
        });
        expect(out.image_descriptions).toHaveLength(3);
        expect(out.image_descriptions[0]).toBe('only first');
        expect(out.image_descriptions[1]).toBe('second obs');
        expect(out.image_descriptions[2]).toBe('No additional observation for image 3.');
    });
});

describe('buildSoftFallbackProse', () => {
    it('returns a FALLBACK_PROSE with requestFailed=true', () => {
        const out = buildSoftFallbackProse({ reason: 'test' });
        expect(out.requestFailed).toBe(true);
        expect(out.diagnosis).toBe(FALLBACK_PROSE.diagnosis);
        expect(out.thought).toBe(FALLBACK_PROSE.thought);
    });

    it('emits the agent-prose:fallback-fired structured warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const err = new ProseGenerationError('short_thought', 'too short', {
                finishReason: 'STOP',
            });
            buildSoftFallbackProse({
                reason: 'thought-too-short',
                error: err,
                conversationId: 'conv-1',
            });
            expect(warn).toHaveBeenCalled();
            const payload = JSON.parse(String(warn.mock.calls[0][0]));
            expect(payload.type).toBe('agent-prose:fallback-fired');
            expect(payload.reason).toBe('thought-too-short');
            expect(payload.error_kind).toBe('short_thought');
            expect(payload.conversationId).toBe('conv-1');
        } finally {
            warn.mockRestore();
        }
    });
});
