/**
 * Phase 5 — `runDiagnosticReasoning` (Agent 2c) tests.
 *
 * The reasoning agent enumerates fault hypotheses and emits homeowner-tappable
 * clarification chips. These tests pin:
 *   1. The MOCK_LLM deterministic fixture (no Gemini call).
 *   2. The high-confidence skip gate (returns null, no Gemini call).
 *   3. The real Gemini path: shape of the request, parsing of a valid response,
 *      and graceful null on malformed JSON / insufficient hypotheses / thrown
 *      model errors.
 *
 * Only the Gemini-facing boundary and the side-effect loggers are mocked; the
 * prompt-variant helpers are pure and run for real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content as GeminiContent } from '@google/genai';
import { runDiagnosticReasoning } from '@/features/diagnosis/agent-reasoning';

const generateContent = vi.fn();

vi.mock('@/lib/ai/ai-diagnosis-backend', () => ({
    GEMINI_MODEL_NAME: 'gemini-2.5-flash',
    GEMINI_CRITIQUE_MODEL_NAME: 'gemini-2.5-flash',
    getDiagnosisModel: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash' }),
    getDiagnosisModelByName: () => ({ client: { models: { generateContent } }, model: 'gemini-2.5-flash' }),
}));
vi.mock('@/lib/ai/ai-cost-logger', () => ({ logGeminiUsage: vi.fn() }));
const logAiCall = vi.fn();
vi.mock('@/lib/ai/ai-call-logger', () => ({
    logAiCall: (...args: unknown[]) => logAiCall(...args),
    textifyGeminiContents: () => 'mock-prompt-text',
}));
vi.mock('@/lib/ai/ai-logging', () => ({ logPipelineStep: vi.fn() }));

const CONTENTS: GeminiContent[] = [
    {
        role: 'user',
        parts: [{ text: 'My garage door opens partway then stops. Photo attached.' }],
    },
];

const VALID_REASONING = {
    hypotheses: [
        {
            id: 'h1',
            label: 'Broken torsion spring',
            confidence_alone: 0.8,
            evidence_for: ['Spring asymmetry visible'],
            evidence_against: [],
            visual_anchor_image_index: 0,
        },
        {
            id: 'h2',
            label: 'Snapped cable',
            confidence_alone: 0.6,
            evidence_for: ['Cable slack on one side'],
            evidence_against: ['Spring looks intact'],
        },
    ],
    what_we_dont_know: 'Whether the door moves at all.',
    why_it_matters: 'Distinguishes a spring failure from a cable failure.',
    chips: [
        { id: 'c1', text: 'Door does not move at all.', supports: 'h1', rules_out: ['h2'] },
        { id: 'c2', text: 'Door moves a little.', supports: 'h2', rules_out: ['h1'] },
        { id: 'c3', text: 'Something else is happening.', supports: '', rules_out: [] },
    ],
    round: 1,
    next_step_if_unresolved: 'ask_again',
};

function geminiResult(payload: unknown) {
    return {
        text: JSON.stringify(payload),
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 40, totalTokenCount: 90 },
    };
}

describe('runDiagnosticReasoning — MOCK_LLM fixture', () => {
    const original = process.env.MOCK_LLM;
    beforeEach(() => {
        process.env.MOCK_LLM = '1';
        generateContent.mockReset();
    });
    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
    });

    it('returns the deterministic fixture without calling Gemini', async () => {
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result).not.toBeNull();
        expect(result!.hypotheses!.length).toBeGreaterThanOrEqual(2);
        expect(result!.chips!.some((c) => /something else/i.test(String(c.text)))).toBe(true);
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('threads the requested round into the fixture output', async () => {
        const result = await runDiagnosticReasoning({ contents: CONTENTS, round: 2 });
        expect(result!.round).toBe(2);
    });
});

describe('runDiagnosticReasoning — high-confidence skip gate', () => {
    const original = process.env.MOCK_LLM;
    beforeEach(() => {
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
    });
    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
    });

    it('returns null and skips Gemini when classifier is highly confident and not asking for clarification', async () => {
        const result = await runDiagnosticReasoning({
            contents: CONTENTS,
            ctx: { classifierConfidence: 92, requiresClarification: false },
        });
        expect(result).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('does NOT skip when clarification is still required even at high confidence', async () => {
        generateContent.mockResolvedValue(geminiResult(VALID_REASONING));
        const result = await runDiagnosticReasoning({
            contents: CONTENTS,
            ctx: { classifierConfidence: 92, requiresClarification: true },
        });
        expect(result).not.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('does NOT skip when confidence is below the gate threshold', async () => {
        generateContent.mockResolvedValue(geminiResult(VALID_REASONING));
        const result = await runDiagnosticReasoning({
            contents: CONTENTS,
            ctx: { classifierConfidence: 70, requiresClarification: false },
        });
        expect(result).not.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(1);
    });
});

describe('runDiagnosticReasoning — real Gemini path', () => {
    const original = process.env.MOCK_LLM;
    beforeEach(() => {
        delete process.env.MOCK_LLM;
        generateContent.mockReset();
        logAiCall.mockReset();
    });
    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
        vi.restoreAllMocks();
    });

    it('parses a valid reasoning response and normalises hypotheses + chips', async () => {
        generateContent.mockResolvedValue(geminiResult(VALID_REASONING));
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result).not.toBeNull();
        expect(result!.hypotheses).toHaveLength(2);
        expect(result!.hypotheses![0].id).toBe('h1');
        // The "Something else" chip's empty supports normalises to null.
        const escape = result!.chips!.find((c) => /something else/i.test(String(c.text)));
        expect(escape?.supports).toBeNull();
    });

    it('sends the original contents plus a trailing reasoning-task user turn', async () => {
        generateContent.mockResolvedValue(geminiResult(VALID_REASONING));
        await runDiagnosticReasoning({ contents: CONTENTS });
        expect(generateContent).toHaveBeenCalledTimes(1);
        const arg = generateContent.mock.calls[0][0] as { contents: GeminiContent[]; config: unknown };
        expect(arg.contents.length).toBe(CONTENTS.length + 1);
        const last = arg.contents[arg.contents.length - 1];
        const text = (last.parts as Array<{ text?: string }>).map((p) => p.text ?? '').join('');
        expect(text).toContain('DIAGNOSTIC REASONING TASK');
    });

    it('returns null on malformed JSON without throwing', async () => {
        generateContent.mockResolvedValue({ text: 'not json at all', usageMetadata: {} });
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result).toBeNull();
    });

    it('returns null when fewer than two hypotheses are returned', async () => {
        generateContent.mockResolvedValue(
            geminiResult({ ...VALID_REASONING, hypotheses: [VALID_REASONING.hypotheses[0]] }),
        );
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result).toBeNull();
    });

    it('returns null when the model call throws', async () => {
        generateContent.mockRejectedValue(new Error('network down'));
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result).toBeNull();
    });

    it('threads the conversation id through to logAiCall on success', async () => {
        generateContent.mockResolvedValue(geminiResult(VALID_REASONING));
        await runDiagnosticReasoning({
            contents: CONTENTS,
            ctx: { conversationId: 'conv-xyz', userId: 'user-1' },
        });
        expect(logAiCall).toHaveBeenCalledTimes(1);
        const payload = logAiCall.mock.calls[0][0] as { conversationId?: string; agentId?: string };
        expect(payload.conversationId).toBe('conv-xyz');
        expect(payload.agentId).toBe('2c');
    });

    it('clamps out-of-range confidence_alone into [0,1]', async () => {
        generateContent.mockResolvedValue(
            geminiResult({
                ...VALID_REASONING,
                hypotheses: [
                    { ...VALID_REASONING.hypotheses[0], confidence_alone: 5 },
                    { ...VALID_REASONING.hypotheses[1], confidence_alone: -2 },
                ],
            }),
        );
        const result = await runDiagnosticReasoning({ contents: CONTENTS });
        expect(result!.hypotheses![0].confidence_alone).toBe(1);
        expect(result!.hypotheses![1].confidence_alone).toBe(0);
    });
});
