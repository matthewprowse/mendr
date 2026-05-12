/**
 * Structured logging utilities for AI/diagnosis pipeline events.
 *
 * All functions emit a single JSON line to stdout so output can be consumed
 * by Vercel's log drain or any JSON-aware logging service without post-processing.
 *
 * Usage:
 *   import { logPipelineStep, logAiEvent } from '@/lib/ai-logging';
 *
 *   const t = Date.now();
 *   // ... do work ...
 *   logPipelineStep({ stepName: 'classify', conversationId, userId, durationMs: Date.now() - t });
 */

// ─── Legacy event type (kept for backward compatibility) ─────────────────────

type AiEndpoint = 'diagnose' | 'providers' | 'reviews-sync' | 'whatsapp' | 'contact-intent';

export interface AiLogEvent {
    endpoint: AiEndpoint;
    status: 'ok' | 'error';
    durationMs: number;
    meta?: Record<string, unknown>;
}

/**
 * Log a high-level AI endpoint event (start/finish/error).
 * Kept for callers that pre-date the structured pipeline step logger.
 */
export function logAiEvent(event: AiLogEvent): void {
    const payload = {
        type: 'ai_event',
        ts: new Date().toISOString(),
        ...event,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
}

// ─── Structured pipeline step logger ─────────────────────────────────────────

/**
 * Names of discrete steps in the diagnosis pipeline.
 * Extend this union when new steps are added so the type checker catches typos.
 */
export type PipelineStepName =
    | 'quota-check'
    | 'image-upload'
    | 'image-tier'
    | 'agent-classify'
    | 'agent-prose'
    | 'conversation-write'
    | 'parts-prices'
    | 'market-rates'
    | 'provider-match'
    | 'stream-complete';

export interface PipelineStepEvent {
    /** Which logical step this log line covers. */
    stepName: PipelineStepName;

    /** Outcome — set to 'error' and pass `errorMessage` when the step fails. */
    status: 'ok' | 'error';

    /** Wall-clock duration of this step in milliseconds. */
    durationMs: number;

    /** The conversation this step belongs to. Used to correlate across log lines. */
    conversationId?: string | null;

    /** Authenticated user, if known. Used to correlate errors back to accounts. */
    userId?: string | null;

    /** Gemini model that ran this step, if applicable. */
    modelName?: string;

    /** Prompt token count reported by usageMetadata, if available. */
    promptTokens?: number;

    /** Completion token count reported by usageMetadata, if available. */
    completionTokens?: number;

    /** Error message when status is 'error'. */
    errorMessage?: string;

    /** Arbitrary extra context (keep small — each field adds log volume). */
    meta?: Record<string, unknown>;
}

/**
 * Emit a structured log line for a single pipeline step.
 *
 * Each line is a self-contained JSON object with `type: 'pipeline_step'` so
 * log drain queries can filter on that field without parsing every log.
 *
 * @example
 * const t = Date.now();
 * const result = await runClassification(...);
 * logPipelineStep({
 *     stepName: 'agent-classify',
 *     status: result.requestFailed ? 'error' : 'ok',
 *     durationMs: Date.now() - t,
 *     conversationId,
 *     userId,
 *     modelName: GEMINI_MODEL_NAME,
 * });
 */
export function logPipelineStep(event: PipelineStepEvent): void {
    const payload = {
        type: 'pipeline_step',
        ts: new Date().toISOString(),
        ...event,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
}
