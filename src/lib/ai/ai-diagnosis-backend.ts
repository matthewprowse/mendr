/**
 * Narrow backend abstraction for diagnosis (and related) AI calls. Gemini is the current implementation;
 * swap `getDiagnosisModel` later without changing route orchestration.
 */
import { getGeminiModel, GEMINI_MODEL_NAME } from '@/lib/ai/ai-client';
import type { GenerativeModel } from '@google/generative-ai';

export { GEMINI_MODEL_NAME };

export function getDiagnosisModel(params?: Parameters<typeof getGeminiModel>[0]): GenerativeModel {
    return getGeminiModel(params);
}
