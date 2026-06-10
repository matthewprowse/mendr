/**
 * Tests for the AI structured loggers. Both `logAiEvent` and `logPipelineStep`
 * emit a single JSON line to console.warn so a log drain can filter on the
 * `type` discriminator. These pin the envelope shape (type, ISO ts) and that
 * caller fields are passed through verbatim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logAiEvent, logPipelineStep } from '../ai-logging';

let warn: ReturnType<typeof vi.spyOn>;

function emitted(): Record<string, unknown> {
    return JSON.parse(warn.mock.calls.at(-1)?.[0] as string) as Record<string, unknown>;
}

beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('logAiEvent', () => {
    it('tags the line with type=ai_event and an ISO timestamp', () => {
        logAiEvent({ endpoint: 'diagnose', status: 'ok', durationMs: 120 });
        const line = emitted();
        expect(line.type).toBe('ai_event');
        expect(typeof line.ts).toBe('string');
        expect(() => new Date(line.ts as string).toISOString()).not.toThrow();
    });

    it('passes through endpoint, status, duration and meta', () => {
        logAiEvent({
            endpoint: 'providers',
            status: 'error',
            durationMs: 950,
            meta: { reason: 'timeout' },
        });
        expect(emitted()).toMatchObject({
            endpoint: 'providers',
            status: 'error',
            durationMs: 950,
            meta: { reason: 'timeout' },
        });
    });
});

describe('logPipelineStep', () => {
    it('tags the line with type=pipeline_step and an ISO timestamp', () => {
        logPipelineStep({ stepName: 'agent-classify', status: 'ok', durationMs: 300 });
        const line = emitted();
        expect(line.type).toBe('pipeline_step');
        expect(typeof line.ts).toBe('string');
    });

    it('carries correlation + token fields when supplied', () => {
        logPipelineStep({
            stepName: 'agent-prose',
            status: 'ok',
            durationMs: 412,
            conversationId: 'conv-1',
            userId: 'user-1',
            modelName: 'gemini-2.5-flash',
            promptTokens: 1200,
            completionTokens: 340,
            cachedContentTokens: 800,
            thinkingTokens: 50,
        });
        expect(emitted()).toMatchObject({
            stepName: 'agent-prose',
            conversationId: 'conv-1',
            userId: 'user-1',
            modelName: 'gemini-2.5-flash',
            promptTokens: 1200,
            completionTokens: 340,
            cachedContentTokens: 800,
            thinkingTokens: 50,
        });
    });

    it('carries errorMessage on a failed step', () => {
        logPipelineStep({
            stepName: 'agent-critique',
            status: 'error',
            durationMs: 10,
            errorMessage: 'model 500',
        });
        const line = emitted();
        expect(line.status).toBe('error');
        expect(line.errorMessage).toBe('model 500');
    });

    it('emits exactly one parseable JSON line per call', () => {
        logPipelineStep({ stepName: 'stream-complete', status: 'ok', durationMs: 1 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(() => JSON.parse(warn.mock.calls[0][0] as string)).not.toThrow();
    });
});
