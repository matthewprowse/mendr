/**
 * Tests for the narrow diagnosis backend abstraction. The contract here is the
 * per-request model override gating: `getDiagnosisModelByName` uses a non-empty
 * trimmed override, otherwise falls back to the env-configured diagnosis model.
 * (The /api/diagnose parser gates whether an override reaches this function at
 * all; this layer just resolves the effective model name.)
 *
 * The underlying client is mocked so no Gemini client is built.
 */
import { describe, it, expect, vi } from 'vitest';

const FAKE_CLIENT = { id: 'fake-genai' };
vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => FAKE_CLIENT,
    GEMINI_MODEL_NAME: 'gemini-2.5-flash',
    GEMINI_CRITIQUE_MODEL_NAME: 'gemini-2.5-flash-critique',
}));

import {
    getDiagnosisModel,
    getDiagnosisModelByName,
    getCritiqueModel,
    GEMINI_MODEL_NAME,
    GEMINI_CRITIQUE_MODEL_NAME,
} from '../ai-diagnosis-backend';

describe('getDiagnosisModel', () => {
    it('returns the shared client and the configured diagnosis model', () => {
        const handle = getDiagnosisModel();
        expect(handle.client).toBe(FAKE_CLIENT);
        expect(handle.model).toBe('gemini-2.5-flash');
    });
});

describe('getCritiqueModel', () => {
    it('returns the critique model, independent of the diagnosis model', () => {
        expect(getCritiqueModel().model).toBe('gemini-2.5-flash-critique');
    });
});

describe('getDiagnosisModelByName — override gating', () => {
    it('uses a non-empty override verbatim (trimmed)', () => {
        expect(getDiagnosisModelByName('gemini-3.5-pro').model).toBe('gemini-3.5-pro');
        expect(getDiagnosisModelByName('  gemini-3.5-pro  ').model).toBe('gemini-3.5-pro');
    });

    it('falls back to the env diagnosis model for null/undefined/empty/whitespace', () => {
        expect(getDiagnosisModelByName(null).model).toBe(GEMINI_MODEL_NAME);
        expect(getDiagnosisModelByName(undefined).model).toBe(GEMINI_MODEL_NAME);
        expect(getDiagnosisModelByName('').model).toBe(GEMINI_MODEL_NAME);
        expect(getDiagnosisModelByName('   ').model).toBe(GEMINI_MODEL_NAME);
    });

    it('always returns the shared client regardless of override', () => {
        expect(getDiagnosisModelByName('anything').client).toBe(FAKE_CLIENT);
    });
});

describe('re-exports', () => {
    it('re-exports the model name constants from ai-client', () => {
        expect(GEMINI_MODEL_NAME).toBe('gemini-2.5-flash');
        expect(GEMINI_CRITIQUE_MODEL_NAME).toBe('gemini-2.5-flash-critique');
    });
});
