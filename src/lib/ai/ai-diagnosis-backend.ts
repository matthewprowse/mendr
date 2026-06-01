/**
 * Narrow backend abstraction for diagnosis (and related) AI calls. Gemini is the current implementation;
 * swap `getDiagnosisModel` later without changing route orchestration.
 *
 * Two SEPARATE model constants flow through here:
 *   - GEMINI_MODEL_NAME           — main pipeline (Agent 2a classify + Agent 2b prose).
 *                                   Defaults to gemini-2.5-flash. Overridable via
 *                                   GEMINI_DIAGNOSIS_MODEL env var for A/B testing.
 *   - GEMINI_CRITIQUE_MODEL_NAME  — Agent 3 self-critique only. Defaults to
 *                                   gemini-2.5-flash and stays there regardless
 *                                   of what the main pipeline runs on. Override
 *                                   via GEMINI_CRITIQUE_MODEL env var.
 *
 * The split lets us A/B the diagnosis path between 2.5 Flash and 3.5 Flash
 * while keeping the observability layer (critique) cheap and stable.
 */
import {
    getGeminiModel,
    getGeminiModelNamed,
    GEMINI_MODEL_NAME,
    GEMINI_CRITIQUE_MODEL_NAME,
} from '@/lib/ai/ai-client';
import type { GenerativeModel } from '@google/generative-ai';

export { GEMINI_MODEL_NAME, GEMINI_CRITIQUE_MODEL_NAME };

export function getDiagnosisModel(
    params?: Parameters<typeof getGeminiModel>[0],
): GenerativeModel {
    return getGeminiModel(params);
}

/**
 * Per-request model override entry point. Used by eval / A-B code that needs
 * to call a different model than the env-configured one. The /api/diagnose
 * request-parser gates the override behind ALLOW_MODEL_OVERRIDE_FROM_REQUEST=1
 * so production clients cannot swap models. Falls back to the env-configured
 * diagnosis model when `model` is null / empty.
 */
export function getDiagnosisModelByName(
    model: string | null | undefined,
    params?: Parameters<typeof getGeminiModelNamed>[1],
): GenerativeModel {
    if (typeof model === 'string' && model.trim().length > 0) {
        return getGeminiModelNamed(model.trim(), params);
    }
    return getGeminiModel(params);
}

export function getCritiqueModel(
    params?: Parameters<typeof getGeminiModelNamed>[1],
): GenerativeModel {
    return getGeminiModelNamed(GEMINI_CRITIQUE_MODEL_NAME, params);
}
