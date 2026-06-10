import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL_NAME: string = process.env.GEMINI_DIAGNOSIS_MODEL ?? 'gemini-2.5-flash';
export const GEMINI_CRITIQUE_MODEL_NAME: string = process.env.GEMINI_CRITIQUE_MODEL ?? 'gemini-2.5-flash';
export const GEMINI_ENRICHMENT_MODEL_NAME: string = process.env.GEMINI_ENRICHMENT_MODEL ?? 'gemini-2.5-flash';

let cachedClient: GoogleGenAI | null = null;

export function getGenAiClient(): GoogleGenAI {
    if (cachedClient) return cachedClient;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    cachedClient = new GoogleGenAI({ apiKey });
    return cachedClient;
}

export function getDiagnosisModel(): { client: GoogleGenAI; model: string } {
    return { client: getGenAiClient(), model: GEMINI_MODEL_NAME };
}

export function getCritiqueModel(): { client: GoogleGenAI; model: string } {
    return { client: getGenAiClient(), model: GEMINI_CRITIQUE_MODEL_NAME };
}

export function getEnrichmentModel(): { client: GoogleGenAI; model: string } {
    return { client: getGenAiClient(), model: GEMINI_ENRICHMENT_MODEL_NAME };
}

export function getGeminiApiKey(): string | null {
    return process.env.GEMINI_API_KEY ?? null;
}
