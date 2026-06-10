/**
 * Contract tests for the Gemini client factory.
 *
 * Pins: (1) the singleton memoisation of GoogleGenAI, (2) the missing-key
 * failure, (3) the three model-name resolvers and their env overrides, and
 * (4) the {client, model} handle shape returned to route orchestration.
 *
 * Because the model-name constants are computed at module load and the client
 * is memoised in module scope, each env-sensitive case re-imports the module
 * after `vi.resetModules()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Record every GoogleGenAI construction so we can assert memoisation + the key
// that was passed. The factory is hoisted; the array lives in test scope and
// survives resetModules().
const ctorCalls: Array<{ apiKey: string }> = [];
vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        apiKey: string;
        constructor(opts: { apiKey: string }) {
            this.apiKey = opts.apiKey;
            ctorCalls.push(opts);
        }
    },
}));

const ENV_KEYS = [
    'GEMINI_API_KEY',
    'GEMINI_DIAGNOSIS_MODEL',
    'GEMINI_CRITIQUE_MODEL',
    'GEMINI_ENRICHMENT_MODEL',
] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.resetModules();
    ctorCalls.length = 0;
    for (const k of ENV_KEYS) SAVED[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (SAVED[k] === undefined) delete process.env[k];
        else process.env[k] = SAVED[k];
    }
});

describe('getGenAiClient', () => {
    it('throws a clear error when GEMINI_API_KEY is not set', async () => {
        const { getGenAiClient } = await import('../ai-client');
        expect(() => getGenAiClient()).toThrow(/GEMINI_API_KEY is not set/);
    });

    it('constructs the client once and memoises it across calls', async () => {
        process.env.GEMINI_API_KEY = 'k-123';
        const { getGenAiClient } = await import('../ai-client');
        const a = getGenAiClient();
        const b = getGenAiClient();
        expect(a).toBe(b);
        expect(ctorCalls).toHaveLength(1);
        expect(ctorCalls[0].apiKey).toBe('k-123');
    });
});

describe('getGeminiApiKey', () => {
    it('returns the key when present', async () => {
        process.env.GEMINI_API_KEY = 'present';
        const { getGeminiApiKey } = await import('../ai-client');
        expect(getGeminiApiKey()).toBe('present');
    });

    it('returns null when absent', async () => {
        const { getGeminiApiKey } = await import('../ai-client');
        expect(getGeminiApiKey()).toBeNull();
    });
});

describe('model name resolution', () => {
    it('defaults all three model constants to gemini-2.5-flash', async () => {
        const mod = await import('../ai-client');
        expect(mod.GEMINI_MODEL_NAME).toBe('gemini-2.5-flash');
        expect(mod.GEMINI_CRITIQUE_MODEL_NAME).toBe('gemini-2.5-flash');
        expect(mod.GEMINI_ENRICHMENT_MODEL_NAME).toBe('gemini-2.5-flash');
    });

    it('honours each env override independently', async () => {
        process.env.GEMINI_DIAGNOSIS_MODEL = 'gemini-3.5-flash';
        process.env.GEMINI_CRITIQUE_MODEL = 'gemini-2.5-flash-lite';
        process.env.GEMINI_ENRICHMENT_MODEL = 'gemini-2.5-pro';
        const mod = await import('../ai-client');
        expect(mod.GEMINI_MODEL_NAME).toBe('gemini-3.5-flash');
        expect(mod.GEMINI_CRITIQUE_MODEL_NAME).toBe('gemini-2.5-flash-lite');
        expect(mod.GEMINI_ENRICHMENT_MODEL_NAME).toBe('gemini-2.5-pro');
    });
});

describe('model handle resolvers', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'k';
    });

    it('getDiagnosisModel returns the shared client + diagnosis model', async () => {
        process.env.GEMINI_DIAGNOSIS_MODEL = 'diag-model';
        const { getDiagnosisModel, getGenAiClient } = await import('../ai-client');
        const handle = getDiagnosisModel();
        expect(handle.model).toBe('diag-model');
        expect(handle.client).toBe(getGenAiClient());
    });

    it('getCritiqueModel returns the critique model', async () => {
        process.env.GEMINI_CRITIQUE_MODEL = 'critique-model';
        const { getCritiqueModel } = await import('../ai-client');
        expect(getCritiqueModel().model).toBe('critique-model');
    });

    it('getEnrichmentModel returns the enrichment model', async () => {
        process.env.GEMINI_ENRICHMENT_MODEL = 'enrich-model';
        const { getEnrichmentModel } = await import('../ai-client');
        expect(getEnrichmentModel().model).toBe('enrich-model');
    });

    it('all three resolvers share the same memoised client instance', async () => {
        const { getDiagnosisModel, getCritiqueModel, getEnrichmentModel } = await import(
            '../ai-client'
        );
        const c1 = getDiagnosisModel().client;
        const c2 = getCritiqueModel().client;
        const c3 = getEnrichmentModel().client;
        expect(c1).toBe(c2);
        expect(c2).toBe(c3);
        expect(ctorCalls).toHaveLength(1);
    });
});
