import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

export const GEMINI_MODEL_NAME = 'gemini-2.5-flash' as const;

type GeminiModelParams = NonNullable<
    Parameters<GoogleGenerativeAI['getGenerativeModel']>[0]
>;

let cachedClient: GoogleGenerativeAI | null = null;

function getClientFromEnv(): GoogleGenerativeAI {
    if (cachedClient) return cachedClient;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    cachedClient = new GoogleGenerativeAI(apiKey);
    return cachedClient;
}

/**
 * Get a Gemini model configured with the default model name.
 * Uses GEMINI_API_KEY from the environment and memoises the underlying client.
 */
export function getGeminiModel(params?: Omit<GeminiModelParams, 'model'>): GenerativeModel {
    return getClientFromEnv().getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        ...(params ?? {}),
    });
}

/** Named model (e.g. Flash Lite for cheap pre-passes). Prefer updating the constant in callers if Google renames tiers. */
export function getGeminiModelNamed(
    model: string,
    params?: Omit<GeminiModelParams, 'model'>,
): GenerativeModel {
    return getClientFromEnv().getGenerativeModel({
        model,
        ...(params ?? {}),
    });
}

